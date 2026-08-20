const { getItemModel } = require('../models/Item');
const { ItemConfig } = require('../config');
const logger = require('../core/logger');

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

        dbItems.forEach((item) => {
            // раскладываем предметы в инвентарь
            if (item.slot < player.inventory.length) {
                player.inventory[item.slot] = {
                    dbId: item.id,
                    itemId: item.item_id,
                    count: item.count,
                };
            }
        });
        this.syncInventory(player);
    }

    /**
     * Синхронизация инвентаря с фронтендом
     * @param {mp.Player} player - Игрок
     */
    syncInventory(player) {
        const clientData = player.inventory.map((slot) =>
            slot ? { itemId: slot.itemId, count: slot.count } : null
        );
        player.call('client:inventory:update', [
            JSON.stringify(clientData),
            JSON.stringify(ItemConfig),
        ]);
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
        const total = player.inventory.reduce(
            (sum, slot) => (slot && slot.itemId === itemId ? sum + slot.count : sum),
            0
        );
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

        const planned = player.inventory.map((s) => (s ? { ...s } : null));
        const writes = [];
        let remaining = amount;

        for (let i = 0; i < planned.length && remaining > 0; i++) {
            const slot = planned[i];
            if (slot && slot.itemId === itemId && slot.count < config.maxStack) {
                const add = Math.min(config.maxStack - slot.count, remaining);
                slot.count += add;
                remaining -= add;
                writes.push({ type: 'update', slot: i, dbId: slot.dbId, count: slot.count });
            }
        }
        while (remaining > 0) {
            const freeSlot = planned.findIndex((s) => s === null); // ищем пустую ячейку
            if (freeSlot === -1) break; // не случится благодаря проверке вместимости выше
            const add = Math.min(config.maxStack, remaining);
            planned[freeSlot] = { dbId: null, itemId, count: add };
            remaining -= add;
            writes.push({ type: 'create', slot: freeSlot, count: add });
        }

        const Item = getItemModel();
        const t = await Item.sequelize.transaction();
        try {
            for (const w of writes) {
                if (w.type === 'update') {
                    await Item.update(
                        { count: w.count },
                        { where: { id: w.dbId }, transaction: t }
                    );
                } else {
                    const created = await Item.create(
                        {
                            owner_id: player.accountId,
                            item_id: itemId,
                            count: w.count,
                            slot: w.slot,
                        },
                        { transaction: t }
                    );
                    planned[w.slot].dbId = created.id;
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            logger.error(`[InventoryService] giveItem транзакция отменена: ${err.message}`);
            return false;
        }
        player.inventory = planned;
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

        const planned = player.inventory.map((s) => (s ? { ...s } : null));
        const writes = [];
        let remaining = amount;

        for (let i = 0; i < planned.length && remaining > 0; i++) {
            const slot = planned[i];
            if (slot && slot.itemId === itemId) {
                const take = Math.min(slot.count, remaining);
                slot.count -= take;
                remaining -= take;
                if (slot.count <= 0) {
                    planned[i] = null;
                    writes.push({ type: 'destroy', dbId: slot.dbId });
                } else {
                    writes.push({ type: 'update', dbId: slot.dbId, count: slot.count });
                }
            }
        }

        const Item = getItemModel();
        const t = await Item.sequelize.transaction();
        try {
            for (const w of writes) {
                if (w.type === 'update') {
                    await Item.update(
                        { count: w.count },
                        { where: { id: w.dbId }, transaction: t }
                    );
                } else {
                    await Item.destroy({ where: { id: w.dbId }, transaction: t });
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            logger.error(`[InventoryService] removeItem транзакция отменена: ${err.message}`);
            return false;
        }
        player.inventory = planned;
        logger.info(
            `[InventoryService] У игрока ${player.accountName} удалено: ${itemId} x${amount}`
        );
        this.syncInventory(player);
        return true;
    }
}

module.exports = new InventoryService();
