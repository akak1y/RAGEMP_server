const inventoryService = require('../services/InventoryService');
const { getItemModel } = require('../models/Item');

jest.mock('../models/Item', () => ({
    getItemModel: jest.fn()
}));

jest.mock('../config', () => ({
    ItemConfig: {
        burger: { name: 'Бургер', weight: 0.2, maxStack: 5 },
        water:  { name: 'Вода', weight: 0.3, maxStack: 10 },
        phone:  { name: 'Смартфон iFruit', weight: 0.5, maxStack: 1 }
    }
}));

jest.mock('../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('InventoryService', () => {
    let mockItemModel;
    let mockPlayer;

    beforeEach(() => {
        jest.clearAllMocks();
        mockItemModel = {
            findAll: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
            destroy: jest.fn()
        };
        getItemModel.mockReturnValue(mockItemModel);

        mockPlayer = {
            accountId: 1,
            accountName: 'TestPlayer',
            inventory: new Array(20).fill(null),
            call: jest.fn()
        };
    });

    describe('hasItem', () => {
        test('возвращает true, если предмет есть в нужном количестве', () => {
            mockPlayer.inventory[0] = { itemId: 'burger', count: 5 };
            expect(inventoryService.hasItem(mockPlayer, 'burger', 3)).toBe(true);
        });

        test('возвращает false, если предмета нет', () => {
            expect(inventoryService.hasItem(mockPlayer, 'burger', 1)).toBe(false);
        });

        test('возвращает false, если недостаточно количества', () => {
            mockPlayer.inventory[0] = { itemId: 'burger', count: 2 };
            expect(inventoryService.hasItem(mockPlayer, 'burger', 5)).toBe(false);
        });

        test('суммирует предметы из разных слотов', () => {
            mockPlayer.inventory[0] = { itemId: 'burger', count: 3 };
            mockPlayer.inventory[1] = { itemId: 'burger', count: 2 };
            expect(inventoryService.hasItem(mockPlayer, 'burger', 5)).toBe(true);
        });

        test('возвращает false, если inventory не массив', () => {
            mockPlayer.inventory = null;
            expect(inventoryService.hasItem(mockPlayer, 'burger', 1)).toBe(false);
        });
    });

    describe('giveItem', () => {
        test('успешно выдаёт предмет в пустой инвентарь', async () => {
            const createdItem = { id: 101, item_id: 'burger', count: 3, slot: 0 };
            mockItemModel.create.mockResolvedValue(createdItem);

            const result = await inventoryService.giveItem(mockPlayer, 'burger', 3);
            expect(result).toBe(true);
            expect(mockItemModel.create).toHaveBeenCalledWith({
                owner_id: 1,
                item_id: 'burger',
                count: 3,
                slot: 0
            });
            expect(mockPlayer.inventory[0]).toEqual({
                dbId: 101,
                itemId: 'burger',
                count: 3
            });
        });

        test('стакает предметы в существующий слот', async () => {
            mockPlayer.inventory[0] = { dbId: 100, itemId: 'water', count: 5 };

            const result = await inventoryService.giveItem(mockPlayer, 'water', 3);
            expect(result).toBe(true);
            expect(mockPlayer.inventory[0].count).toBe(8);
            expect(mockItemModel.update).toHaveBeenCalledWith(
                { count: 8 },
                { where: { id: 100 } }
            );
        });

        test('отклоняет несуществующий itemId', async () => {
            const result = await inventoryService.giveItem(mockPlayer, 'fake_item', 1);
            expect(result).toBe(false);
            expect(mockItemModel.create).not.toHaveBeenCalled();
        });

        test('отклоняет отрицательное количество', async () => {
            const logger = require('../logger');
            const result = await inventoryService.giveItem(mockPlayer, 'burger', -5);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('некорректное'));
        });

        test('отклоняет нулевое количество', async () => {
            const result = await inventoryService.giveItem(mockPlayer, 'burger', 0);
            expect(result).toBe(false);
        });

        test('возвращает false, если нет места в инвентаре', async () => {
            for (let i = 0; i < 20; i++) {
                mockPlayer.inventory[i] = { dbId: i, itemId: 'burger', count: 5 };
            }

            const result = await inventoryService.giveItem(mockPlayer, 'burger', 1);
            expect(result).toBe(false);
        });

        test('синхронизирует инвентарь с клиентом', async () => {
            mockItemModel.create.mockResolvedValue({ id: 101, item_id: 'burger', count: 1, slot: 0 });
            await inventoryService.giveItem(mockPlayer, 'burger', 1);
            expect(mockPlayer.call).toHaveBeenCalledWith(
                'client:inventory:update',
                expect.any(Array)
            );
        });
    });

    describe('removeItem', () => {
        test('успешно удаляет предмет', async () => {
            mockPlayer.inventory[0] = { dbId: 100, itemId: 'burger', count: 5 };

            const result = await inventoryService.removeItem(mockPlayer, 'burger', 3);
            expect(result).toBe(true);
            expect(mockPlayer.inventory[0].count).toBe(2);
            expect(mockItemModel.update).toHaveBeenCalledWith(
                { count: 2 },
                { where: { id: 100 } }
            );
        });

        test('полностью удаляет предмет и очищает слот', async () => {
            mockPlayer.inventory[0] = { dbId: 100, itemId: 'burger', count: 3 };

            const result = await inventoryService.removeItem(mockPlayer, 'burger', 3);
            expect(result).toBe(true);
            expect(mockPlayer.inventory[0]).toBeNull();
            expect(mockItemModel.destroy).toHaveBeenCalledWith({ where: { id: 100 } });
        });

        test('возвращает false, если предмета нет', async () => {
            const result = await inventoryService.removeItem(mockPlayer, 'burger', 1);
            expect(result).toBe(false);
        });

        test('возвращает false, если недостаточно количества', async () => {
            mockPlayer.inventory[0] = { dbId: 100, itemId: 'burger', count: 2 };
            const result = await inventoryService.removeItem(mockPlayer, 'burger', 5);
            expect(result).toBe(false);
        });

        test('суммирует предметы из разных слотов при удалении', async () => {
            mockPlayer.inventory[0] = { dbId: 100, itemId: 'burger', count: 3 };
            mockPlayer.inventory[1] = { dbId: 101, itemId: 'burger', count: 2 };

            const result = await inventoryService.removeItem(mockPlayer, 'burger', 4);
            expect(result).toBe(true);
            expect(mockPlayer.inventory[0]).toBeNull();
            expect(mockPlayer.inventory[1].count).toBe(1);
        });
    });

    describe('loadPlayerInventory', () => {
        test('загружает предметы из БД в память', async () => {
            mockItemModel.findAll.mockResolvedValue([
                { id: 100, item_id: 'burger', count: 5, slot: 0 },
                { id: 101, item_id: 'water',  count: 3, slot: 2 }
            ]);

            await inventoryService.loadPlayerInventory(mockPlayer);

            expect(mockPlayer.inventory[0]).toEqual({
                dbId: 100,
                itemId: 'burger',
                count: 5
            });
            expect(mockPlayer.inventory[2]).toEqual({
                dbId: 101,
                itemId: 'water',
                count: 3
            });
            expect(mockPlayer.inventory[1]).toBeNull();
        });

        test('синхронизирует с клиентом после загрузки', async () => {
            mockItemModel.findAll.mockResolvedValue([]);
            await inventoryService.loadPlayerInventory(mockPlayer);
            expect(mockPlayer.call).toHaveBeenCalledWith(
                'client:inventory:update',
                expect.any(Array)
            );
        });
    });
});