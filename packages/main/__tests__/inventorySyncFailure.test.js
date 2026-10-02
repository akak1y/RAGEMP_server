const mockTransaction = {
    commit: jest.fn(),
    rollback: jest.fn(),
};

const mockItemModel = {
    sequelize: {
        transaction: jest.fn(),
    },
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
};

jest.mock('../models/Item', () => ({
    getItemModel: jest.fn(() => mockItemModel),
}));

jest.mock('../config', () => ({
    ItemConfig: {
        ore: { name: 'Руда', maxStack: 10 },
    },
    InventoryConfig: {
        size: 2,
    },
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

jest.mock('../core/eventSender', () => ({
    sendEvent: jest.fn(),
}));

const inventoryService = require('../services/InventoryService');
const logger = require('../core/logger');
const { sendEvent } = require('../core/eventSender');

describe('InventoryService: устойчивость к сбоям синхронизации UI', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockTransaction.commit.mockResolvedValue(undefined);
        mockTransaction.rollback.mockResolvedValue(undefined);

        mockItemModel.sequelize.transaction.mockResolvedValue(mockTransaction);
        mockItemModel.create.mockResolvedValue({ id: 10 });
        mockItemModel.update.mockResolvedValue([1]);
        mockItemModel.destroy.mockResolvedValue(1);

        sendEvent.mockImplementation(() => {
            throw new Error('client gone');
        });
    });

    test('giveItem: исключение sendEvent после commit не отменяет успешную выдачу', async () => {
        const player = {
            accountId: 1,
            accountName: 'tester',
            inventory: [null, null],
        };

        const result = await inventoryService.giveItem(player, 'ore', 1);

        expect(result).toEqual({ success: true });
        expect(mockTransaction.commit).toHaveBeenCalled();
        expect(mockTransaction.rollback).not.toHaveBeenCalled();
        expect(player.inventory[0]).toMatchObject({
            dbId: 10,
            itemId: 'ore',
            count: 1,
        });
        expect(sendEvent).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('syncInventory: не удалось отправить обновление инвентаря')
        );
    });

    test('removeItem: исключение sendEvent после commit не отменяет успешное удаление', async () => {
        const player = {
            accountId: 2,
            accountName: 'tester2',
            inventory: [{ dbId: 11, itemId: 'ore', count: 3 }, null],
        };

        const result = await inventoryService.removeItem(player, 'ore', 3);

        expect(result).toEqual({ success: true });
        expect(mockTransaction.commit).toHaveBeenCalled();
        expect(mockTransaction.rollback).not.toHaveBeenCalled();
        expect(player.inventory[0]).toBeNull();
        expect(mockItemModel.destroy).toHaveBeenCalledWith({
            where: { id: 11 },
            transaction: mockTransaction,
        });
        expect(sendEvent).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('syncInventory: не удалось отправить обновление инвентаря')
        );
    });
});
