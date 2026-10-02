const { ShopConfig, ItemConfig } = require('../config');
const inventoryService = require('./InventoryService');
const auditService = require('./AuditService');
const logger = require('../core/logger');

/**
 * Сервис магазина — покупка предметов игроками
 */
class ShopService {
    /**
     * Безопасный возврат денег после неудачной выдачи товара.
     * @private
     */
    async _refund(player, amount, reason) {
        try {
            const ok = await player.addMoney(amount, reason);
            if (!ok) {
                logger.error(
                    `[ShopService] Не удалось вернуть $${amount} игроку ${player.accountName}: addMoney вернул false`
                );
            }
            return ok;
        } catch (err) {
            logger.error(
                `[ShopService] Исключение при возврате $${amount} игроку ${player.accountName}: ${err.message}`
            );
            return false;
        }
    }

    /**
     * Покупка предмета
     * @param {mp.Player} player - Игрок
     * @param {string} itemId - ID предмета из ItemConfig
     * @param {number} [amount=1] - Количество
     * @returns {Promise<{success: boolean, error?: string, data?: Object}>}
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

        // Выдаём предмет.
        let invResult;
        try {
            invResult = await inventoryService.giveItem(player, itemId, amount);
        } catch (err) {
            logger.error(
                `[ShopService] buyItem: giveItem упала для ${itemId} x${amount} игроку ${player.accountName}: ${err.message}`
            );
            await this._refund(player, totalPrice, 'shop_refund');
            return { success: false, error: 'db_error' };
        }

        if (!invResult || !invResult.success) {
            logger.warn(`[ShopService] buyItem: инвентарь не принял товар, возврат денег`);
            await this._refund(player, totalPrice, 'shop_refund');
            return { success: false, error: (invResult && invResult.error) || 'db_error' };
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
