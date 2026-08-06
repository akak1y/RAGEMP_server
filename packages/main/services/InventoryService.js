const { getItemModel } = require('../models/Item');
const { ItemConfig } = require('../config');
const logger = require('../logger');

/**
 * Сервис инвентаря игроков
 */
class InventoryService {
    constructor() {
        this.inventorySize = 20; // размер инвентаря
    }

    /**
     * Загрузка инвентаря из БД в память игрока
     * @param {mp.Player} player - Игрок
     */
    async loadPlayerInventory(player) {
        player.inventory = new Array(this.inventorySize).fill(null); // пустой инвентарь
        const dbItems = await getItemModel().findAll({ where: { owner_id: player.accountId } }); // вытаскиваем из бд все предметы этого игрока

        dbItems.forEach(item => { // раскладываем предметы в инвентарь
            if (item.slot < player.inventory.length) {
                player.inventory[item.slot] = { dbId: item.id, itemId: item.item_id, count: item.count };
            }
        });
        this.syncInventory(player);
    }

    /**
     * Синхронизация инвентаря с фронтендом
     * @param {mp.Player} player - Игрок
     */
    syncInventory(player) {
        const clientData = player.inventory.map(slot => slot ? { itemId: slot.itemId, count: slot.count } : null);
        player.call('client:inventory:update', [
            JSON.stringify(clientData),
            JSON.stringify(ItemConfig)
        ])
    }

    /**
     * Проверка наличия предмета у игрока
     * @param {mp.Player} player - Игрок
     * @param {string} itemId - ID предмета
     * @param {number} [amount=1] - Сколько штук нужно
     * @returns {boolean}
     */
    hasItem(player, itemId, amount = 1) {
        if (!Array.isArray(player.inventory)) return false;
        const total = player.inventory.reduce((sum, slot) => (slot && slot.itemId === itemId) ? sum + slot.count : sum, 0);
        return total >= amount;
    }

    /**
     * Выдать предмет
     * @param {mp.Player} player - Игрок
     * @param {string} itemId - ID предмета из ItemConfig
     * @param {number} [amount=1] - Количество
     * @returns {Promise<boolean>} Успешность
     */
    async giveItem(player, itemId, amount = 1) {
        if (!ItemConfig[itemId]) return false;
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[InventoryService] giveItem отклонена: некорректное количество ${amount}`);
            return false;
        }
        const config = ItemConfig[itemId];

        let space = 0;
        for (const slot of player.inventory) {
            if (slot && slot.itemId === itemId) space += Math.max(0, config.maxStack - slot.count);
            if (!slot) space += config.maxStack;
        }
        if (space < amount) return false; // инвентарь не вместит

        let remaining = amount;

        for (const slot of player.inventory) {
            if (remaining <= 0) break;
            if (slot && slot.itemId === itemId && slot.count < config.maxStack) {
                const add = Math.min(config.maxStack - slot.count, remaining);
                slot.count += add;
                remaining -= add;
                await getItemModel().update({ count: slot.count }, { where: { id: slot.dbId } });
            }
        }

        while (remaining > 0) {
            const freeSlot = player.inventory.findIndex(s => s === null); // ищем пустую ячейку
            if (freeSlot === -1) break; // не случится благодаря проверке вместимости выше
            const add = Math.min(config.maxStack, remaining);
            const newItem = await getItemModel().create({ // создаём новый предмет
                owner_id: player.accountId,
                item_id: itemId,
                count: add,
                slot: freeSlot
            });
            player.inventory[freeSlot] = { dbId: newItem.id, itemId, count: add };
            remaining -= add;
        }

        logger.info(`[InventoryService] Игроку ${player.accountName} выдано: ${itemId} x${amount}`);
        this.syncInventory(player);
        return true;
    }

    /**
     * Удалить предмет
     * @param {mp.Player} player - Игрок
     * @param {string} itemId - ID предмета
     * @param {number} [amount=1] - Количество
     * @returns {Promise<boolean>} Успешность
     */
    async removeItem(player, itemId, amount = 1) {
        if (!this.hasItem(player, itemId, amount)) return false;

        let remaining = amount;
        for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
            const slot = player.inventory[i];
            if (slot && slot.itemId === itemId) {
                const take = Math.min(slot.count, remaining);
                slot.count -= take;
                remaining -= take;

                if (slot.count <= 0) {
                    await getItemModel().destroy({ where: { id: slot.dbId } });
                    player.inventory[i] = null;
                } else { await getItemModel().update({ count: slot.count }, { where: { id: slot.dbId } }) }
            }
        }

        logger.info(`[InventoryService] У игрока ${player.accountName} удалено: ${itemId} x${amount}`);
        this.syncInventory(player);
        return true;
    }
}

module.exports = new InventoryService();