const shopService = require('../services/ShopService');
const moneyService = require('../services/MoneyService');
const inventoryService = require('../services/InventoryService');
const auditService = require('../services/AuditService');

jest.mock('../services/MoneyService');
jest.mock('../services/InventoryService');
jest.mock('../services/AuditService');

describe('ShopService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('успешная покупка: деньги списаны, предмет выдан', async () => {
        const player = { accountId: 1, accountName: 'test_user' };
        moneyService.takeMoney.mockResolvedValue(true);
        inventoryService.giveItem.mockResolvedValue(true);
        auditService.logPlayer.mockResolvedValue({ id: 1 });

        const result = await shopService.buyItem(player, 'burger', 2);

        expect(result).toBe(true);
        expect(moneyService.takeMoney).toHaveBeenCalledWith(1, 100, 'shop'); // 50 * 2
        expect(inventoryService.giveItem).toHaveBeenCalledWith(player, 'burger', 2);
        expect(auditService.logPlayer).toHaveBeenCalledWith(player, 'shop_buy', {
            category: 'economy',
            success: true,
            details: { itemId: 'burger', amount: 2, totalPrice: 100 },
        });
    });

    test('недостаточно денег: покупка отклонена', async () => {
        const player = { accountId: 1, accountName: 'test_user' };
        moneyService.takeMoney.mockResolvedValue(false);

        const result = await shopService.buyItem(player, 'burger', 2);

        expect(result).toBe(false);
        expect(moneyService.takeMoney).toHaveBeenCalledWith(1, 100, 'shop');
        expect(inventoryService.giveItem).not.toHaveBeenCalled();
    });

    test('инвентарь не вместил: деньги возвращены', async () => {
        const player = { accountId: 1, accountName: 'test_user' };
        moneyService.takeMoney.mockResolvedValue(true);
        moneyService.addMoney.mockResolvedValue(true);
        inventoryService.giveItem.mockResolvedValue(false);

        const result = await shopService.buyItem(player, 'burger', 2);

        expect(result).toBe(false);
        expect(moneyService.takeMoney).toHaveBeenCalledWith(1, 100, 'shop');
        expect(moneyService.addMoney).toHaveBeenCalledWith(1, 100, 'shop_refund');
    });

    test('товар не найден в ShopConfig: покупка отклонена', async () => {
        const player = { accountId: 1, accountName: 'test_user' };

        const result = await shopService.buyItem(player, 'nonexistent', 1);

        expect(result).toBe(false);
        expect(moneyService.takeMoney).not.toHaveBeenCalled();
    });

    test('некорректное количество: покупка отклонена', async () => {
        const player = { accountId: 1, accountName: 'test_user' };

        const result = await shopService.buyItem(player, 'burger', -5);

        expect(result).toBe(false);
        expect(moneyService.takeMoney).not.toHaveBeenCalled();
    });

    test('игрок не авторизован: покупка отклонена', async () => {
        const player = { accountId: null, accountName: 'test_user' };

        const result = await shopService.buyItem(player, 'burger', 1);

        expect(result).toBe(false);
        expect(moneyService.takeMoney).not.toHaveBeenCalled();
    });
});
