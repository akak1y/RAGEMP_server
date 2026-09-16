const armoryService = require('../services/ArmoryService');
const { getFactionArmoryLoanModel } = require('../models/FactionArmoryLoan');
const factionStorageService = require('../services/FactionStorageService');
const inventoryService = require('../services/InventoryService');

jest.mock('../models/FactionArmoryLoan', () => ({ getFactionArmoryLoanModel: jest.fn() }));
jest.mock('../services/FactionStorageService');
jest.mock('../services/InventoryService');
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    WeaponConfig: {
        weapon_pistol: {
            hash: 'weapon_pistol',
            name: 'Пистолет',
            ammoType: 'ammo_9mm',
            maxClip: 12,
        },
    },
    ArmoryConfig: { minRankTake: 1, maxActiveLoans: 1 },
}));

const makePlayer = () => ({ accountId: 1, accountName: 'Test', inventory: [] });
const loan = (id, itemId, count, factionId = 1) => ({
    id,
    faction_id: factionId,
    account_id: 1,
    item_id: itemId,
    count,
    issued_at: new Date(),
    update: jest.fn(),
    destroy: jest.fn(),
});

describe('ArmoryService', () => {
    let mockModel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockModel = {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 1 }),
            update: jest.fn().mockResolvedValue([1]),
            destroy: jest.fn().mockResolvedValue(1),
        };
        getFactionArmoryLoanModel.mockReturnValue(mockModel);
    });

    describe('isArmoryItem', () => {
        test('ствол и патроны — true, бургер — false', () => {
            expect(armoryService.isArmoryItem('weapon_pistol')).toBe(true);
            expect(armoryService.isArmoryItem('ammo_9mm')).toBe(true);
            expect(armoryService.isArmoryItem('burger')).toBe(false);
        });
    });

    describe('issue', () => {
        test('не арсенальный предмет — отказ без обращения к складу', async () => {
            const res = await armoryService.issue(makePlayer(), 1, 'burger', 1);
            expect(res).toEqual({ success: false, error: 'not_armory_item' });
            expect(factionStorageService.withdraw).not.toHaveBeenCalled();
        });

        test('лимит займов — too_many_loans', async () => {
            mockModel.findAll.mockResolvedValue([loan(1, 'weapon_pistol', 1)]);
            const res = await armoryService.issue(makePlayer(), 1, 'ammo_9mm', 10);
            expect(res).toEqual({ success: false, error: 'too_many_loans' });
            expect(factionStorageService.withdraw).not.toHaveBeenCalled();
        });

        test('успех: создан заём после выдачи со склада', async () => {
            factionStorageService.withdraw.mockResolvedValue({ success: true });
            const res = await armoryService.issue(makePlayer(), 1, 'weapon_pistol', 1);
            expect(res).toEqual({ success: true });
            expect(factionStorageService.withdraw).toHaveBeenCalledWith(
                expect.objectContaining({ accountId: 1 }),
                1,
                'weapon_pistol',
                1
            );
            expect(mockModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    faction_id: 1,
                    account_id: 1,
                    item_id: 'weapon_pistol',
                    count: 1,
                })
            );
        });

        test('существующий заём: количество наращивается, без create', async () => {
            mockModel.findAll.mockResolvedValue([loan(5, 'ammo_9mm', 30)]);
            factionStorageService.withdraw.mockResolvedValue({ success: true });
            const res = await armoryService.issue(makePlayer(), 1, 'ammo_9mm', 10);
            expect(res).toEqual({ success: true });
            expect(mockModel.update).toHaveBeenCalledWith({ count: 40 }, { where: { id: 5 } });
            expect(mockModel.create).not.toHaveBeenCalled();
        });

        test('склад беднее — ошибка склада пробрасывается, заём не создан', async () => {
            factionStorageService.withdraw.mockResolvedValue({
                success: false,
                error: 'not_enough_items',
            });
            const res = await armoryService.issue(makePlayer(), 1, 'weapon_pistol', 1);
            expect(res).toEqual({ success: false, error: 'not_enough_items' });
            expect(mockModel.create).not.toHaveBeenCalled();
        });

        test('сбой записи займа — компенсация возвратом на склад', async () => {
            factionStorageService.withdraw.mockResolvedValue({ success: true });
            mockModel.create.mockRejectedValue(new Error('db down'));
            factionStorageService.deposit.mockResolvedValue({ success: true });
            const res = await armoryService.issue(makePlayer(), 1, 'weapon_pistol', 1);
            expect(res).toEqual({ success: false, error: 'db_error' });
            expect(factionStorageService.deposit).toHaveBeenCalledWith(
                expect.objectContaining({ accountId: 1 }),
                1,
                'weapon_pistol',
                1
            );
        });
    });

    describe('returnItem', () => {
        test('нет займа — no_loan', async () => {
            const res = await armoryService.returnItem(makePlayer(), 1, 'weapon_pistol', 1);
            expect(res).toEqual({ success: false, error: 'no_loan' });
        });

        test('частичный возврат: deposit на склад и декремент займа', async () => {
            const loanRow = loan(5, 'ammo_9mm', 5);
            mockModel.findOne.mockResolvedValue(loanRow);
            inventoryService.countItem.mockReturnValue(3);
            factionStorageService.deposit.mockResolvedValue({ success: true });
            const res = await armoryService.returnItem(makePlayer(), 1, 'ammo_9mm', 3);
            expect(res).toEqual({ success: true, returned: 3 });
            expect(factionStorageService.deposit).toHaveBeenCalledWith(
                expect.objectContaining({ accountId: 1 }),
                1,
                'ammo_9mm',
                3
            );
            expect(loanRow.update).toHaveBeenCalledWith({ count: 2 });
            expect(loanRow.destroy).not.toHaveBeenCalled();
        });

        test('полный возврат: заём удалён', async () => {
            const loanRow = loan(5, 'weapon_pistol', 1);
            mockModel.findOne.mockResolvedValue(loanRow);
            inventoryService.countItem.mockReturnValue(1);
            factionStorageService.deposit.mockResolvedValue({ success: true });
            const res = await armoryService.returnItem(makePlayer(), 1, 'weapon_pistol', 1);
            expect(res).toEqual({ success: true, returned: 1 });
            expect(loanRow.destroy).toHaveBeenCalled();
        });

        test('склад полон — ошибка, заём не тронут', async () => {
            const loanRow = loan(5, 'weapon_pistol', 1);
            mockModel.findOne.mockResolvedValue(loanRow);
            inventoryService.countItem.mockReturnValue(1);
            factionStorageService.deposit.mockResolvedValue({
                success: false,
                error: 'storage_full',
            });
            const res = await armoryService.returnItem(makePlayer(), 1, 'weapon_pistol', 1);
            expect(res).toEqual({ success: false, error: 'storage_full' });
            expect(loanRow.destroy).not.toHaveBeenCalled();
            expect(loanRow.update).not.toHaveBeenCalled();
        });
    });

    describe('returnAll', () => {
        test('возвращает только то, что в инвентаре; пустые займы пропускает', async () => {
            mockModel.findAll.mockResolvedValue([
                loan(1, 'weapon_pistol', 1),
                loan(2, 'ammo_9mm', 30),
            ]);
            inventoryService.countItem.mockImplementation((p, id) =>
                id === 'weapon_pistol' ? 1 : 0
            );
            factionStorageService.deposit.mockResolvedValue({ success: true });
            const rows = await armoryService.returnAll(makePlayer(), 'death');
            expect(rows).toBe(1);
            expect(factionStorageService.deposit).toHaveBeenCalledTimes(1);
            expect(factionStorageService.deposit).toHaveBeenCalledWith(
                expect.objectContaining({ accountId: 1 }),
                1,
                'weapon_pistol',
                1
            );
            expect(mockModel.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
        });

        test('склад полон при авто-возврате — заём сохраняется', async () => {
            mockModel.findAll.mockResolvedValue([loan(1, 'weapon_pistol', 1)]);
            inventoryService.countItem.mockReturnValue(1);
            factionStorageService.deposit.mockResolvedValue({
                success: false,
                error: 'storage_full',
            });
            const rows = await armoryService.returnAll(makePlayer(), 'quit');
            expect(rows).toBe(0);
            expect(mockModel.destroy).not.toHaveBeenCalled();
        });
    });
});
