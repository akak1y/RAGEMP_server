const mockMoneyService = {
    addMoney: jest.fn(),
    takeMoney: jest.fn(),
};

jest.mock('../services/MoneyService', () => mockMoneyService);

jest.mock('../core/eventSender', () => ({
    sendEvent: jest.fn(),
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { sendEvent } = require('../core/eventSender');
const logger = require('../core/logger');

global.mp = {
    Player: function Player() {},
};

require('../controllers/moneyApi');

const makePlayer = (overrides = {}) => {
    const player = Object.create(mp.Player.prototype);
    player.accountId = 1;
    player.accountName = 'tester';
    player.money = 1000;
    Object.assign(player, overrides);
    return player;
};

describe('moneyApi: устойчивость к сбоям синхронизации HUD', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        sendEvent.mockImplementation(() => {
            throw new Error('client gone');
        });
    });

    test('addMoney: исключение sendEvent после зачисления в БД не отменяет успех', async () => {
        mockMoneyService.addMoney.mockResolvedValue(true);
        const player = makePlayer();

        const result = await player.addMoney(500, 'тест');

        expect(result).toBe(true);
        expect(player.money).toBe(1500);
        expect(mockMoneyService.addMoney).toHaveBeenCalledWith(1, 500, 'тест');

        expect(sendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: 1,
                accountName: 'tester',
                money: 1500,
            }),
            'client:updateMoney',
            [1500]
        );

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('syncMoneyHud: не удалось отправить обновление баланса')
        );
    });

    test('takeMoney: исключение sendEvent после списания в БД не отменяет успех', async () => {
        mockMoneyService.takeMoney.mockResolvedValue(true);
        const player = makePlayer();

        const result = await player.takeMoney(300, 'покупка');

        expect(result).toBe(true);
        expect(player.money).toBe(700);
        expect(mockMoneyService.takeMoney).toHaveBeenCalledWith(1, 300, 'покупка');

        expect(sendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: 1,
                accountName: 'tester',
                money: 700,
            }),
            'client:updateMoney',
            [700]
        );

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('syncMoneyHud: не удалось отправить обновление баланса')
        );
    });

    test('addMoney: false из БД не трогает money и не зовёт sendEvent', async () => {
        mockMoneyService.addMoney.mockResolvedValue(false);
        const player = makePlayer();

        const result = await player.addMoney(500, 'тест');

        expect(result).toBe(false);
        expect(player.money).toBe(1000);
        expect(sendEvent).not.toHaveBeenCalled();
    });

    test('takeMoney: false из БД (недостаточно средств) не трогает money', async () => {
        mockMoneyService.takeMoney.mockResolvedValue(false);
        const player = makePlayer();

        const result = await player.takeMoney(999999, 'покупка');

        expect(result).toBe(false);
        expect(player.money).toBe(1000);
        expect(sendEvent).not.toHaveBeenCalled();
    });

    test('addMoney: исключение самого moneyService (БД упала) → false без изменения money', async () => {
        mockMoneyService.addMoney.mockRejectedValue(new Error('db down'));
        const player = makePlayer();

        const result = await player.addMoney(500, 'тест');

        expect(result).toBe(false);
        expect(player.money).toBe(1000);
        expect(sendEvent).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[MoneyApi] addMoney:'));
    });

    test('applyMoneyDelta: сбой sendEvent не бросает наружу и не теряет локальный delta', () => {
        const player = makePlayer();

        expect(() => player.applyMoneyDelta(-200)).not.toThrow();
        expect(player.money).toBe(800);

        expect(sendEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: 1,
                accountName: 'tester',
                money: 800,
            }),
            'client:updateMoney',
            [800]
        );

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('applyMoneyDelta: не удалось отправить обновление баланса')
        );
    });
});
