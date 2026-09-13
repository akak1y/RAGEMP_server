const { ItemConfig, FactionStorageConfig } = require('../config');
const { getFactionStorageItemModel } = require('../models/FactionStorageItem');
const inventoryService = require('./InventoryService');
const logger = require('../core/logger');

/**
 * FactionStorageService — семейный склад: общие слоты предметов фракции.
 */
class FactionStorageService {
    size() {
        return FactionStorageConfig.size || 50;
    }

    /**
     * Слоты склада: массив размера size с null в пустых ячейках
     * @param {number} factionId
     * @returns {Promise<Array<Object|null>>}
     */
    async loadSlots(factionId) {
        const slots = new Array(this.size()).fill(null);
        const rows = await getFactionStorageItemModel().findAll({
            where: { faction_id: factionId },
        });
        for (const r of rows) {
            if (r.slot >= 0 && r.slot < slots.length) {
                slots[r.slot] = { dbId: r.id, itemId: r.item_id, count: r.count };
            }
        }
        return slots;
    }

    /**
     * Представление склада для UI
     * @param {number} factionId
     * @param {number} memberRank - ранг запросившего
     */
    async getView(factionId, memberRank) {
        const slots = await this.loadSlots(factionId);
        return {
            size: this.size(),
            canDeposit: memberRank >= (FactionStorageConfig.minRankDeposit || 0),
            canWithdraw: memberRank >= (FactionStorageConfig.minRankWithdraw || 0),
            items: slots
                .map((s, slot) =>
                    s
                        ? {
                              slot,
                              itemId: s.itemId,
                              name: (ItemConfig[s.itemId] || {}).name || s.itemId,
                              count: s.count,
                          }
                        : null
                )
                .filter(Boolean),
        };
    }

    /**
     * Свободное место под предмет с учётом maxStack
     * @private
     */
    _spaceFor(slots, itemId) {
        const maxStack = ItemConfig[itemId].maxStack;
        let space = 0;
        for (const s of slots) {
            if (s && s.itemId === itemId) space += Math.max(0, maxStack - s.count);
            if (!s) space += maxStack;
        }
        return space;
    }

    /**
     * Сколько предмета уже лежит на складе
     * @private
     */
    _storedCount(slots, itemId) {
        return slots.reduce((sum, s) => (s && s.itemId === itemId ? sum + s.count : sum), 0);
    }

    /**
     * Положить предмет: личный инвентарь → склад.
     */
    async deposit(player, factionId, itemId, amount) {
        if (!player || !player.accountId) return { success: false, error: 'not_authorized' };
        if (!ItemConfig[itemId]) return { success: false, error: 'item_not_in_config' };
        if (!Number.isInteger(amount) || amount <= 0)
            return { success: false, error: 'invalid_amount' };
        const pre = await this.loadSlots(factionId);
        if (this._spaceFor(pre, itemId) < amount) return { success: false, error: 'storage_full' };
        const removed = await inventoryService.removeItem(player, itemId, amount);
        if (!removed.success) return { success: false, error: removed.error };
        const res = await this._mutate(factionId, itemId, amount, 1);
        if (!res.success) {
            await inventoryService.giveItem(player, itemId, amount);
            return res;
        }
        logger.info(
            `[FactionStorageService] ${player.accountName} положил на склад фракции ${factionId}: ${itemId} x${amount}`
        );
        return { success: true };
    }

    /**
     * Взять предмет: склад → личный инвентарь.
     */
    async withdraw(player, factionId, itemId, amount) {
        if (!player || !player.accountId) return { success: false, error: 'not_authorized' };
        if (!ItemConfig[itemId]) return { success: false, error: 'item_not_in_config' };
        if (!Number.isInteger(amount) || amount <= 0)
            return { success: false, error: 'invalid_amount' };
        const pre = await this.loadSlots(factionId);
        if (this._storedCount(pre, itemId) < amount)
            return { success: false, error: 'not_enough_items' };
        const given = await inventoryService.giveItem(player, itemId, amount);
        if (!given.success) return { success: false, error: given.error };
        const res = await this._mutate(factionId, itemId, amount, -1);
        if (!res.success) {
            await inventoryService.removeItem(player, itemId, amount);
            return res;
        }
        logger.info(
            `[FactionStorageService] ${player.accountName} взял со склада фракции ${factionId}: ${itemId} x${amount}`
        );
        return { success: true };
    }

    /**
     * Изменение склада под блокировкой строк: повторная проверка места/остатка
     * @private
     * @param {number} direction - 1 положить, -1 взять
     */
    async _mutate(factionId, itemId, amount, direction) {
        const Model = getFactionStorageItemModel();
        const t = await Model.sequelize.transaction();
        try {
            const rows = await Model.findAll({
                where: { faction_id: factionId },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            const slots = new Array(this.size()).fill(null);
            for (const r of rows) {
                if (r.slot >= 0 && r.slot < slots.length) {
                    slots[r.slot] = { dbId: r.id, itemId: r.item_id, count: r.count };
                }
            }
            if (direction === 1) {
                if (this._spaceFor(slots, itemId) < amount) {
                    await t.rollback();
                    return { success: false, error: 'storage_full' };
                }
            } else if (this._storedCount(slots, itemId) < amount) {
                await t.rollback();
                return { success: false, error: 'not_enough_items' };
            }
            const planned = slots.map((s) => (s ? { ...s } : null));
            const writes = [];
            let remaining = amount;
            if (direction === 1) {
                const maxStack = ItemConfig[itemId].maxStack;
                for (let i = 0; i < planned.length && remaining > 0; i++) {
                    const s = planned[i];
                    if (s && s.itemId === itemId && s.count < maxStack) {
                        const add = Math.min(maxStack - s.count, remaining);
                        s.count += add;
                        remaining -= add;
                        writes.push({ type: 'update', dbId: s.dbId, count: s.count });
                    }
                }
                while (remaining > 0) {
                    const free = planned.findIndex((s) => s === null);
                    if (free === -1) break;
                    const add = Math.min(maxStack, remaining);
                    planned[free] = { dbId: null, itemId, count: add };
                    remaining -= add;
                    writes.push({ type: 'create', slot: free, count: add });
                }
            } else {
                for (let i = 0; i < planned.length && remaining > 0; i++) {
                    const s = planned[i];
                    if (s && s.itemId === itemId) {
                        const take = Math.min(s.count, remaining);
                        s.count -= take;
                        remaining -= take;
                        if (s.count <= 0) {
                            planned[i] = null;
                            writes.push({ type: 'destroy', dbId: s.dbId });
                        } else {
                            writes.push({ type: 'update', dbId: s.dbId, count: s.count });
                        }
                    }
                }
            }
            if (remaining > 0) {
                await t.rollback();
                return { success: false, error: 'storage_race' };
            }
            for (const w of writes) {
                if (w.type === 'update') {
                    await Model.update(
                        { count: w.count },
                        { where: { id: w.dbId }, transaction: t }
                    );
                } else if (w.type === 'create') {
                    const created = await Model.create(
                        { faction_id: factionId, item_id: itemId, count: w.count, slot: w.slot },
                        { transaction: t }
                    );
                    planned[w.slot].dbId = created.id;
                } else {
                    await Model.destroy({ where: { id: w.dbId }, transaction: t });
                }
            }
            await t.commit();
            return { success: true };
        } catch (err) {
            await t.rollback();
            logger.error(`[FactionStorageService] транзакция склада отменена: ${err.message}`);
            return { success: false, error: 'db_error' };
        }
    }
}
module.exports = new FactionStorageService();
