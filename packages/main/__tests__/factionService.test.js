const factionService = require('../services/FactionService');
const moneyService = require('../services/MoneyService');

const mockFactionModel = {
    count: jest.fn(async () => 1),
    create: jest.fn(async () => ({ id: 1 })),
    update: jest.fn(async () => [1]),
    findByPk: jest.fn(async () => ({ id: 1, name: 'Семья', treasury: 1000 })),
};

const mockMemberModel = {
    findOne: jest.fn(),
    findAll: jest.fn(async () => []),
    create: jest.fn(async () => ({})),
    destroy: jest.fn(async () => 1),
    update: jest.fn(async () => [1]),
};

jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../core/db', () => ({
    getSequelize: () => ({ transaction: (cb) => cb({}), literal: (s) => s }),
}));
jest.mock('../models/Faction', () => ({
    getFactionModel: () => mockFactionModel,
}));
jest.mock('../models/FactionMember', () => ({
    getFactionMemberModel: () => mockMemberModel,
}));
jest.mock('../services/MoneyService', () => ({
    takeMoney: jest.fn(async () => true),
    addMoney: jest.fn(async () => true),
}));

const makePlayer = () => ({
    accountId: 1,
    accountName: 'Test',
    applyMoneyDelta: jest.fn(),
});

describe('FactionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFactionModel.findByPk.mockResolvedValue({ id: 1, name: 'Семья', treasury: 1000 });
    });

    describe('ранги и права', () => {
        test('rankName: известное и неизвестное значение', () => {
            const ranks = factionService.getRanks();
            expect(factionService.rankName(ranks.length - 1)).toBe(ranks[ranks.length - 1].name);
            expect(factionService.rankName(99)).toBe(ranks[0].name);
        });
        test('can: боец не выводит из кассы, дон выводит', () => {
            expect(factionService.can({ rank: 1 }, 'withdraw')).toBe(false);
            expect(factionService.can({ rank: 4 }, 'withdraw')).toBe(true);
        });
        test('can: инвайт с капо', () => {
            expect(factionService.can({ rank: 1 }, 'invite')).toBe(false);
            expect(factionService.can({ rank: 2 }, 'invite')).toBe(true);
        });
    });

    describe('addMember', () => {
        test('уже во фракции — отказ', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 0 });
            const res = await factionService.addMember(1, 1);
            expect(res).toEqual({ success: false, error: 'already_in_faction' });
        });
        test('свободен — создан', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce(null);
            const res = await factionService.addMember(1, 2);
            expect(res).toEqual({ success: true });
            expect(mockMemberModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ faction_id: 1, account_id: 2, rank: 0 })
            );
        });
    });

    describe('deposit', () => {
        test('некорректная сумма — отказ без списаний', async () => {
            const res = await factionService.deposit(makePlayer(), -5);
            expect(res).toEqual({ success: false, error: 'invalid_sum' });
            expect(moneyService.takeMoney).not.toHaveBeenCalled();
        });
        test('успех: списание в транзакции + HUD-дельта', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 1 });
            const p = makePlayer();
            const res = await factionService.deposit(p, 200);
            expect(res).toEqual({ success: true });
            expect(moneyService.takeMoney).toHaveBeenCalledWith(1, 200, 'взнос в кассу Семья', {});
            expect(p.applyMoneyDelta).toHaveBeenCalledWith(-200);
        });
        test('нет денег — отказ', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 1 });
            moneyService.takeMoney.mockResolvedValueOnce(false);
            const p = makePlayer();
            const res = await factionService.deposit(p, 200);
            expect(res).toEqual({ success: false, error: 'not_enough_money' });
            expect(p.applyMoneyDelta).not.toHaveBeenCalled();
        });
    });

    describe('withdraw', () => {
        test('низкий ранг — отказ', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 1 });
            const res = await factionService.withdraw(makePlayer(), 100);
            expect(res).toEqual({ success: false, error: 'no_permission' });
        });
        test('касса беднее суммы — отказ', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 4 });
            const res = await factionService.withdraw(makePlayer(), 5000);
            expect(res).toEqual({ success: false, error: 'treasury_poor' });
        });
        test('дон выводит: касса -1000, игрок +1000', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 4 });
            mockFactionModel.update.mockResolvedValueOnce([1]);
            const p = makePlayer();
            const res = await factionService.withdraw(p, 500);
            expect(res).toEqual({ success: true });
            expect(moneyService.addMoney).toHaveBeenCalledWith(
                1,
                500,
                'выплата из кассы Семья',
                {}
            );
            expect(p.applyMoneyDelta).toHaveBeenCalledWith(500);
        });
        test('гонка: казна исчерпана внутри транзакции — отказ без выплаты', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce({ faction_id: 1, rank: 4 });
            mockFactionModel.update.mockResolvedValueOnce([0]);
            const p = makePlayer();
            const res = await factionService.withdraw(p, 500);
            expect(res).toEqual({ success: false, error: 'treasury_poor' });
            expect(moneyService.addMoney).not.toHaveBeenCalled();
            expect(p.applyMoneyDelta).not.toHaveBeenCalled();
        });
    });

    describe('управление составом', () => {
        const member = (rank) => ({ faction_id: 1, rank });

        test('invite: оружейник приглашает, новичок получает ранг 0', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce(member(2)).mockResolvedValueOnce(null);
            const res = await factionService.invite(makePlayer(), 7);
            expect(res).toEqual({ success: true });
            expect(mockMemberModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ faction_id: 1, account_id: 7, rank: 0 })
            );
        });

        test('invite: боец без права invite — отказ', async () => {
            mockMemberModel.findOne.mockResolvedValueOnce(member(1));
            const res = await factionService.invite(makePlayer(), 7);
            expect(res).toEqual({ success: false, error: 'no_permission' });
            expect(mockMemberModel.create).not.toHaveBeenCalled();
        });

        test('kick: нельзя исключить равного по рангу', async () => {
            mockMemberModel.findOne
                .mockResolvedValueOnce(member(3))
                .mockResolvedValueOnce(member(3));
            const res = await factionService.kick(makePlayer(), 7);
            expect(res).toEqual({ success: false, error: 'rank_too_high' });
            expect(mockMemberModel.destroy).not.toHaveBeenCalled();
        });

        test('changeRank +1: босс повышает правую руку до ранга 3', async () => {
            mockMemberModel.findOne
                .mockResolvedValueOnce(member(4))
                .mockResolvedValueOnce(member(3));
            const res = await factionService.changeRank(makePlayer(), 7, 1);
            expect(res).toEqual({ success: false, error: 'rank_too_high' });
        });

        test('changeRank +1: босс повышает оружейника до ранга 3', async () => {
            mockMemberModel.findOne
                .mockResolvedValueOnce(member(4))
                .mockResolvedValueOnce(member(2));
            mockMemberModel.update.mockResolvedValueOnce([1]);
            const res = await factionService.changeRank(makePlayer(), 7, 1);
            expect(res).toEqual({ success: true, rank: 3 });
            expect(mockMemberModel.update).toHaveBeenCalledWith(
                { rank: 3 },
                { where: { account_id: 7 } }
            );
        });

        test('changeRank -1: демotion до низа ограничен', async () => {
            mockMemberModel.findOne
                .mockResolvedValueOnce(member(4))
                .mockResolvedValueOnce(member(0));
            const res = await factionService.changeRank(makePlayer(), 7, -1);
            expect(res).toEqual({ success: false, error: 'rank_limit' });
        });
    });
});
