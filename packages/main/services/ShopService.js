const { ShopConfig, ItemConfig } = require('../config');
const inventoryService = require('./InventoryService');
const auditService = require('./AuditService');
const logger = require('../core/logger');

/**
 * Сервис магазина — покупка предметов игроками
 */
class ShopService {
    /**
     * Покупка предмета
     * @param {mp.Player} player - Игрок
     * @param {string} itemId - ID предмета из ItemConfig
     * @param {number} [amount=1] - Количество
     * @returns {Promise<boolean>} Успешность покупки
     */
    async buyItem(player, itemId, amount = 1) {
        // Валидация входных данных
        if (!player || !player.accountId) {
            logger.warn('[ShopService] buyItem: игрок не авторизован');
            return { success: false, error: 'not_authorized' };
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[ShopService] buyItem: некорректное количество ${amount}`);
            return { success: false, error: 'invalid_amount' };
        }

        // Проверяем товар в конфиге магазина
        const shopItem = ShopConfig.items.find((item) => item.itemId === itemId);
        if (!shopItem) {
            logger.warn(`[ShopService] buyItem: товар ${itemId} не найден в магазине`);
            return { success: false, error: 'item_not_in_shop' };
        }

        // Проверяем товар в ItemConfig (существует ли вообще)
        if (!ItemConfig[itemId]) {
            logger.error(`[ShopService] buyItem: товар ${itemId} не найден в ItemConfig`);
            return { success: false, error: 'item_not_in_config' };
        }

        const totalPrice = shopItem.price * amount;

        // Списываем деньги
        const moneyOk = await player.takeMoney(totalPrice, 'shop');
        if (!moneyOk) {
            logger.warn(
                `[ShopService] buyItem: у игрока ${player.accountName} недостаточно средств для покупки ${itemId} x${amount}`
            );
            return { success: false, error: 'insufficient_funds' };
        }

        // Выдаём предмет
        const invResult = await inventoryService.giveItem(player, itemId, amount);
        if (!invResult.success) {
            logger.warn(`[ShopService] buyItem: инвентарь полон, возврат денег`);
            await player.addMoney(totalPrice, 'shop_refund');
            return { success: false, error: invResult.error };
        }

        // Логирование
        auditService.logPlayer(player, 'shop_buy', {
            category: 'economy',
            success: true,
            details: { itemId, amount, totalPrice },
        });

        logger.info(
            `[ShopService] Игрок ${player.accountName} купил: ${itemId} x${amount} за $${totalPrice}`
        );
        return { success: true, data: { totalPrice } };
    }
}

module.exports = new ShopService();
