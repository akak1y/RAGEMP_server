const { WeaponConfig, ArmoryConfig } = require('../config');
const { getFactionArmoryLoanModel } = require('../models/FactionArmoryLoan');
const factionStorageService = require('./FactionStorageService');
const inventoryService = require('./InventoryService');
const logger = require('../core/logger');

/**
 * ArmoryService — семейный арсенал: выдача оружия/патронов со склада под учётом.
 * Авто-возврат при смерти/выходе.
 */
class ArmoryService {
    /** Предмет относится к арсеналу: ствол или патроны любого ствола */
    isArmoryItem(itemId) {
        if (WeaponConfig[itemId]) return true;
        return Object.values(WeaponConfig).some((cfg) => cfg.ammoType === itemId);
    }

    /** Активные займы члена семьи */
    async getMyLoans(accountId) {
        const rows = await getFactionArmoryLoanModel().findAll({
            where: { account_id: accountId },
        });
        return rows.map((r) => ({
            id: r.id,
            factionId: r.faction_id,
            itemId: r.item_id,
            count: r.count,
            issuedAt: r.issued_at,
        }));
    }

    /** Выдать со склада под заём. */
    async issue(player, factionId, itemId, count) {
        if (!player || !player.accountId) return { success: false, error: 'not_authorized' };
        if (!this.isArmoryItem(itemId)) return { success: false, error: 'not_armory_item' };
        if (!Number.isInteger(count) || count <= 0)
            return { success: false, error: 'invalid_amount' };
        const loans = await this.getMyLoans(player.accountId);
        const existing = loans.find((l) => l.itemId === itemId);
        if (!existing && loans.length >= ArmoryConfig.maxActiveLoans)
            return { success: false, error: 'too_many_loans' };
        const taken = await factionStorageService.withdraw(player, factionId, itemId, count);
        if (!taken.success) return taken;
        try {
            const Model = getFactionArmoryLoanModel();
            if (existing) {
                await Model.update(
                    { count: existing.count + count },
                    { where: { id: existing.id } }
                );
            } else {
                await Model.create({
                    faction_id: factionId,
                    account_id: player.accountId,
                    item_id: itemId,
                    count,
                });
            }
        } catch (err) {
            await factionStorageService.deposit(player, factionId, itemId, count);
            logger.error(`[ArmoryService] заём не создан, предмет возвращён: ${err.message}`);
            return { success: false, error: 'db_error' };
        }
        logger.info(
            `[ArmoryService] ${player.accountName} взял из арсенала фракции ${factionId}: ${itemId} x${count}`
        );
        return { success: true };
    }

    /** Ручной возврат займа */
    async returnItem(player, factionId, itemId, count) {
        if (!player || !player.accountId) return { success: false, error: 'not_authorized' };
        if (!Number.isInteger(count) || count <= 0)
            return { success: false, error: 'invalid_amount' };
        const Model = getFactionArmoryLoanModel();
        const loan = await Model.findOne({
            where: { faction_id: factionId, account_id: player.accountId, item_id: itemId },
        });
        if (!loan) return { success: false, error: 'no_loan' };
        const available = inventoryService.countItem(player, itemId);
        const returned = Math.min(count, loan.count, available);
        if (returned <= 0) return { success: false, error: 'not_enough_items' };
        const put = await factionStorageService.deposit(player, factionId, itemId, returned);
        if (!put.success) return put;
        if (returned >= loan.count) await loan.destroy();
        else await loan.update({ count: loan.count - returned });
        logger.info(
            `[ArmoryService] ${player.accountName} вернул в арсенал фракции ${factionId}: ${itemId} x${returned}`
        );
        return { success: true, returned };
    }

    /** Авто-возврат всех займов (смерть/выход): возвращаем только то, что в инвентаре */
    async returnAll(player, reason = 'auto') {
        if (!player || !player.accountId) return 0;
        const loans = await this.getMyLoans(player.accountId);
        const Model = getFactionArmoryLoanModel();
        let returnedRows = 0;
        for (const loan of loans) {
            const available = inventoryService.countItem(player, loan.itemId);
            if (available <= 0) continue;
            const returned = Math.min(loan.count, available);
            const put = await factionStorageService.deposit(
                player,
                loan.factionId,
                loan.itemId,
                returned
            );
            if (!put.success) {
                logger.warn(
                    `[ArmoryService] авто-возврат ${loan.itemId} x${returned} не удался: ${put.error}`
                );
                continue; // заём остаётся: игрок донесёт предмет позже
            }
            if (returned >= loan.count) await Model.destroy({ where: { id: loan.id } });
            else await Model.update({ count: loan.count - returned }, { where: { id: loan.id } });
            returnedRows++;
            logger.info(
                `[ArmoryService] авто-возврат (${reason}): ${player.accountName} → фракция ${loan.factionId}: ${loan.itemId} x${returned}`
            );
        }
        return returnedRows;
    }
}
module.exports = new ArmoryService();
