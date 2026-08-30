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
            return false;
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[ShopService] buyItem: некорректное количество ${amount}`);
            return false;
        }

        // Проверяем товар в конфиге магазина
        const shopItem = ShopConfig.items.find((item) => item.itemId === itemId);
        if (!shopItem) {
            logger.warn(`[ShopService] buyItem: товар ${itemId} не найден в магазине`);
            return false;
        }

        // Проверяем товар в ItemConfig (существует ли вообще)
        if (!ItemConfig[itemId]) {
            logger.error(`[ShopService] buyItem: товар ${itemId} не найден в ItemConfig`);
            return false;
        }

        const totalPrice = shopItem.price * amount;

        // Списываем деньги
        const moneyOk = await player.takeMoney(totalPrice, 'shop');
        if (!moneyOk) {
            logger.warn(
                `[ShopService] buyItem: у игрока ${player.accountName} недостаточно средств для покупки ${itemId} x${amount}`
            );
            return false;
        }

        // Выдаём предмет
        const inventoryOk = await inventoryService.giveItem(player, itemId, amount);
        if (!inventoryOk) {
            // Если инвентарь не вместил — возвращаем деньги
            logger.warn(
                `[ShopService] buyItem: инвентарь игрока ${player.accountName} не вместил ${itemId} x${amount}, возврат денег`
            );
            await player.addMoney(totalPrice, 'shop_refund');
            return false;
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
        return true;
    }
}

module.exports = new ShopService();
