jest.mock('../models/Item', () => ({ getItemModel: jest.fn() }));
jest.mock('../core/eventSender', () => ({ sendEvent: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    ItemConfig: {
        burger: { name: 'Бургер', maxStack: 10 },
        water: { name: 'Вода', maxStack: 10 },
    },
    InventoryConfig: { size: 20 },
}));
const { getItemModel } = require('../models/Item');
const inventoryService = require('../services/InventoryService');

const mockTx = { commit: jest.fn(), rollback: jest.fn() };
const mockItemModel = {
    create: jest.fn(async (data) => ({ id: 100 + data.slot })),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    findAll: jest.fn().mockResolvedValue([]),
    sequelize: { transaction: jest.fn(async () => mockTx) },
};

const makePlayer = () => ({
    accountId: 1,
    accountName: 'Tester',
    inventory: new Array(20).fill(null),
});

describe('InventoryService: гонки read-modify-write', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getItemModel.mockReturnValue(mockItemModel);
        mockTx.commit.mockClear();
        mockTx.rollback.mockClear();
    });

    test('параллельные giveItem разных предметов: оба сохранены, слоты не конфликтуют', async () => {
        const player = makePlayer();
        const [r1, r2] = await Promise.all([
            inventoryService.giveItem(player, 'burger', 3),
            inventoryService.giveItem(player, 'water', 4),
        ]);
        expect(r1).toEqual({ success: true });
        expect(r2).toEqual({ success: true });
        expect(player.inventory[0]).toMatchObject({ itemId: 'burger', count: 3 });
        expect(player.inventory[1]).toMatchObject({ itemId: 'water', count: 4 });
        const slots = mockItemModel.create.mock.calls.map((c) => c[0].slot);
        expect(slots).toEqual([0, 1]);
    });

    test('параллельные giveItem одного предмета: стак доливаются последовательно, не теряя', async () => {
        const player = makePlayer();
        await Promise.all([
            inventoryService.giveItem(player, 'burger', 3),
            inventoryService.giveItem(player, 'burger', 4),
        ]);
        expect(player.inventory[0]).toMatchObject({ itemId: 'burger', count: 7 });
        expect(mockItemModel.create).toHaveBeenCalledTimes(1);
        expect(mockItemModel.update).toHaveBeenCalledTimes(1);
    });

    test('параллельные removeItem сверх остатка: второй отклонён, а не списан дважды', async () => {
        const player = makePlayer();
        player.inventory[0] = { dbId: 50, itemId: 'burger', count: 5 };
        const [r1, r2] = await Promise.all([
            inventoryService.removeItem(player, 'burger', 3),
            inventoryService.removeItem(player, 'burger', 3),
        ]);
        expect(r1).toEqual({ success: true });
        expect(r2).toEqual({ success: false, error: 'not_enough_items' });
        expect(player.inventory[0]).toMatchObject({ count: 2 });
    });
});
