const factionStorageService = require('../services/FactionStorageService');
const { getFactionStorageItemModel } = require('../models/FactionStorageItem');
const inventoryService = require('../services/InventoryService');

jest.mock('../models/FactionStorageItem', () => ({ getFactionStorageItemModel: jest.fn() }));
jest.mock('../services/InventoryService');
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    ItemConfig: {
        burger: { name: 'Бургер', weight: 0.2, maxStack: 5 },
        weapon_pistol: { name: 'Пистолет', weight: 1.0, maxStack: 1 },
    },
    FactionStorageConfig: {
        size: 3,
        minRankDeposit: 0,
        minRankWithdraw: 2,
        interactRadius: 3,
    },
}));

const makePlayer = () => ({ accountId: 1, accountName: 'Test', inventory: [] });
const row = (id, itemId, count, slot) => ({ id, item_id: itemId, count, slot });

describe('FactionStorageService', () => {
    let mockModel;
    let mockTx;
    beforeEach(() => {
        jest.clearAllMocks();
        mockTx = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };
        mockModel = {
            findAll: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue([1]),
            create: jest.fn().mockResolvedValue({ id: 50 }),
            destroy: jest.fn().mockResolvedValue(1),
            sequelize: { transaction: jest.fn().mockResolvedValue(mockTx) },
        };
        getFactionStorageItemModel.mockReturnValue(mockModel);
    });

    describe('deposit', () => {
        test('пустой склад: предмет создан в слот 0, транзакция закоммичена', async () => {
            inventoryService.removeItem.mockResolvedValue({ success: true });
            const res = await factionStorageService.deposit(makePlayer(), 1, 'burger', 2);
            expect(res).toEqual({ success: true });
            expect(mockModel.create).toHaveBeenCalledWith(
                { faction_id: 1, item_id: 'burger', count: 2, slot: 0 },
                { transaction: mockTx }
            );
            expect(mockTx.commit).toHaveBeenCalled();
            expect(mockTx.rollback).not.toHaveBeenCalled();
        });

        test('достакинг в частичный слот без create', async () => {
            mockModel.findAll.mockResolvedValue([row(7, 'burger', 3, 0)]);
            inventoryService.removeItem.mockResolvedValue({ success: true });
            const res = await factionStorageService.deposit(makePlayer(), 1, 'burger', 2);
            expect(res).toEqual({ success: true });
            expect(mockModel.update).toHaveBeenCalledWith(
                { count: 5 },
                { where: { id: 7 }, transaction: mockTx }
            );
            expect(mockModel.create).not.toHaveBeenCalled();
        });

        test('склад заполнен: отказ без снятия с игрока', async () => {
            mockModel.findAll.mockResolvedValue([
                row(1, 'burger', 5, 0),
                row(2, 'burger', 5, 1),
                row(3, 'burger', 5, 2),
            ]);
            const res = await factionStorageService.deposit(makePlayer(), 1, 'burger', 1);
            expect(res).toEqual({ success: false, error: 'storage_full' });
            expect(inventoryService.removeItem).not.toHaveBeenCalled();
        });

        test('сбой транзакции: компенсация возвратом предмета игроку', async () => {
            inventoryService.removeItem.mockResolvedValue({ success: true });
            mockModel.create.mockRejectedValue(new Error('db down'));
            const res = await factionStorageService.deposit(makePlayer(), 1, 'burger', 1);
            expect(res).toEqual({ success: false, error: 'db_error' });
            expect(mockTx.rollback).toHaveBeenCalled();
            expect(inventoryService.giveItem).toHaveBeenCalledWith(
                expect.objectContaining({ accountId: 1 }),
                'burger',
                1
            );
        });

        test('некорректные входные данные отклоняются до обращения в БД', async () => {
            expect(await factionStorageService.deposit(makePlayer(), 1, 'burger', 0)).toEqual({
                success: false,
                error: 'invalid_amount',
            });
            expect(await factionStorageService.deposit(makePlayer(), 1, 'nope', 1)).toEqual({
                success: false,
                error: 'item_not_in_config',
            });
            expect(mockModel.findAll).not.toHaveBeenCalled();
        });
    });

    describe('withdraw', () => {
        test('полное изъятие: строка склада уничтожена', async () => {
            mockModel.findAll.mockResolvedValue([row(7, 'burger', 5, 0)]);
            inventoryService.giveItem.mockResolvedValue({ success: true });
            const res = await factionStorageService.withdraw(makePlayer(), 1, 'burger', 5);
            expect(res).toEqual({ success: true });
            expect(mockModel.destroy).toHaveBeenCalledWith({
                where: { id: 7 },
                transaction: mockTx,
            });
            expect(mockTx.commit).toHaveBeenCalled();
        });

        test('недостаточно на складе: отказ до выдачи игроку', async () => {
            mockModel.findAll.mockResolvedValue([row(7, 'burger', 2, 0)]);
            const res = await factionStorageService.withdraw(makePlayer(), 1, 'burger', 5);
            expect(res).toEqual({ success: false, error: 'not_enough_items' });
            expect(inventoryService.giveItem).not.toHaveBeenCalled();
        });

        test('инвентарь полон: склад не тронут', async () => {
            mockModel.findAll.mockResolvedValue([row(7, 'burger', 5, 0)]);
            inventoryService.giveItem.mockResolvedValue({
                success: false,
                error: 'inventory_full',
            });
            const res = await factionStorageService.withdraw(makePlayer(), 1, 'burger', 1);
            expect(res).toEqual({ success: false, error: 'inventory_full' });
            expect(mockModel.destroy).not.toHaveBeenCalled();
            expect(mockModel.update).not.toHaveBeenCalled();
        });
    });

    describe('getView', () => {
        test('имена предметов и флаги прав по рангу', async () => {
            mockModel.findAll.mockResolvedValue([row(7, 'burger', 3, 0)]);
            const view = await factionStorageService.getView(1, 1);
            expect(view.size).toBe(3);
            expect(view.canDeposit).toBe(true);
            expect(view.canWithdraw).toBe(false);
            expect(view.items).toEqual([{ slot: 0, itemId: 'burger', name: 'Бургер', count: 3 }]);
        });
    });
});
