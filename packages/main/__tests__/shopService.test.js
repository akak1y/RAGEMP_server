const shopService = require('../services/ShopService');
const inventoryService = require('../services/InventoryService');
const auditService = require('../services/AuditService');

jest.mock('../services/InventoryService');
jest.mock('../services/AuditService');

/**
 * Фейк-игрок с контрактами moneyApi
 */
function makePlayer(overrides = {}) {
    const player = { accountId: 1, accountName: 'test_user', money: 1000, ...overrides };
    player.takeMoney = jest.fn(async (sum) => {
        if (player.money < sum) return false;
        player.money -= sum;
        return true;
    });
    player.addMoney = jest.fn(async (sum) => {
        player.money += sum;
        return true;
    });
    return player;
}

describe('ShopService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('успешная покупка: деньги списаны, предмет выдан', async () => {
        const player = makePlayer();
        inventoryService.giveItem.mockResolvedValue(true);
        auditService.logPlayer.mockResolvedValue({ id: 1 });

        const result = await shopService.buyItem(player, 'burger', 2);

        expect(result).toBe(true);
        expect(player.takeMoney).toHaveBeenCalledWith(100, 'shop');
        expect(player.money).toBe(900);
        expect(inventoryService.giveItem).toHaveBeenCalledWith(player, 'burger', 2);
        expect(auditService.logPlayer).toHaveBeenCalledWith(player, 'shop_buy', {
            category: 'economy',
            success: true,
            details: { itemId: 'burger', amount: 2, totalPrice: 100 },
        });
    });

    test('недостаточно денег: покупка отклонена', async () => {
        const player = makePlayer({ money: 50 });

        const result = await shopService.buyItem(player, 'burger', 2);

        expect(result).toBe(false);
        expect(player.money).toBe(50);
        expect(inventoryService.giveItem).not.toHaveBeenCalled();
    });

    test('инвентарь не вместил: деньги возвращены', async () => {
        const player = makePlayer();
        inventoryService.giveItem.mockResolvedValue(false);

        const result = await shopService.buyItem(player, 'burger', 2);

        expect(result).toBe(false);
        expect(player.takeMoney).toHaveBeenCalledWith(100, 'shop');
        expect(player.addMoney).toHaveBeenCalledWith(100, 'shop_refund');
        expect(player.money).toBe(1000);
    });

    test('товар не найден в ShopConfig: покупка отклонена', async () => {
        const player = makePlayer();

        const result = await shopService.buyItem(player, 'nonexistent', 1);

        expect(result).toBe(false);
        expect(player.takeMoney).not.toHaveBeenCalled();
    });

    test('некорректное количество: покупка отклонена', async () => {
        const player = makePlayer();

        const result = await shopService.buyItem(player, 'burger', -5);

        expect(result).toBe(false);
        expect(player.takeMoney).not.toHaveBeenCalled();
    });

    test('игрок не авторизован: покупка отклонена', async () => {
        const player = makePlayer({ accountId: null });

        const result = await shopService.buyItem(player, 'burger', 1);

        expect(result).toBe(false);
        expect(player.takeMoney).not.toHaveBeenCalled();
    });
});
