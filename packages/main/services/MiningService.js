const { MiningConfig, BotSpawnPos } = require('../config');
const inventoryService = require('./InventoryService');
const auditService = require('./AuditService');
const locationService = require('./LocationService');
const { isNear } = require('../utils/distance');
const logger = require('../core/logger');

/**
 * Сервис работы шахтёра — добыча руды и продажа боту
 */
class MiningService {
    constructor() {
        this.activeMiners = new Map();
        this.shiftStats = new Map();
        // состояние камней: исчерпан / время респавна
        this.rockState = MiningConfig.rocks.map(() => ({ depleted: false, respawnAt: 0 }));
        const t = setInterval(() => this.respawnCheck(), 3000);
        if (t.unref) t.unref();
    }

    /**
     * Начать копать.
     */
    startWork(player, rockIndex) {
        if (!player || !player.accountId) return false;
        const rock = MiningConfig.rocks[rockIndex];
        if (!rock) return false;
        if (this.rockState[rockIndex].depleted) return false;
        if (!isNear(player.position, rock, MiningConfig.interactRadius)) return false;

        this.activeMiners.set(player.accountId, { rockIndex, startedAt: Date.now() });
        return true;
    }

    /**
     * Завершить добычу.
     */
    async completeMine(player) {
        if (!player || !player.accountId) return false;

        const record = this.activeMiners.get(player.accountId);
        if (!record) {
            logger.warn(`[MiningService] completeMine: ${player.accountName} не начинал работу`);
            return false;
        }

        const elapsed = Date.now() - record.startedAt;
        if (elapsed < MiningConfig.mineTimeMs - 100) {
            logger.warn(
                `[MiningService] completeMine: ${player.accountName} слишком быстро (${elapsed}мс)`
            );
            return false;
        }

        const rock = MiningConfig.rocks[record.rockIndex];
        if (!rock || !isNear(player.position, rock, MiningConfig.interactRadius)) {
            logger.warn(`[MiningService] completeMine: ${player.accountName} отошёл от камня`);
            return false;
        }

        const shiftCount = this.shiftStats.get(player.accountId) || 0;

        const given = await inventoryService.giveItem(player, 'ore', 1);
        if (!given) {
            logger.warn(`[MiningService] completeMine: инвентарь ${player.accountName} полон`);
            return false;
        }

        this.shiftStats.set(player.accountId, shiftCount + 1);
        this.activeMiners.delete(player.accountId);
        this.depleteRock(record.rockIndex);

        auditService.logPlayer(player, 'mining_complete', {
            category: 'economy',
            success: true,
            details: { shiftCount: shiftCount + 1 },
        });

        logger.info(`[MiningService] ${player.accountName} добыл руду`);
        return true;
    }

    /**
     * Продать всю руду боту.
     */
    async sellAllOre(player) {
        if (!player || !player.accountId) return { success: false, message: 'Не авторизован' };

        if (!isNear(player.position, BotSpawnPos, MiningConfig.interactRadius)) {
            return { success: false, message: 'Подойдите к скупщику' };
        }

        const oreCount = inventoryService.countItem(player, 'ore');
        if (oreCount <= 0) {
            return { success: false, message: 'Нет руды для продажи' };
        }

        const removed = await inventoryService.removeItem(player, 'ore', oreCount);
        if (!removed) {
            return { success: false, message: 'Ошибка инвентаря' };
        }

        const totalPrice = MiningConfig.oreSellPrice * oreCount;
        const moneyOk = await player.addMoney(totalPrice, 'mining');
        if (!moneyOk) {
            await inventoryService.giveItem(player, 'ore', oreCount);
            return { success: false, message: 'Ошибка денег' };
        }

        auditService.logPlayer(player, 'mining_sell', {
            category: 'economy',
            success: true,
            details: { amount: oreCount, totalPrice },
        });

        logger.info(
            `[MiningService] ${player.accountName} продал ${oreCount} руды за $${totalPrice}`
        );
        return { success: true, message: `Продано ${oreCount} руды за $${totalPrice}` };
    }

    /**
     * Завершить смену.
     */
    endWork(player) {
        if (!player || !player.accountId) return;
        this.activeMiners.delete(player.accountId);
        this.shiftStats.delete(player.accountId);
        logger.info(`[MiningService] ${player.accountName} завершил смену`);
    }

    /**
     * Случайный интервал респавна
     */
    randomRespawnDelay() {
        const min = MiningConfig.rockRespawnMinMs;
        const max = MiningConfig.rockRespawnMaxMs;
        return min + Math.floor(Math.random() * (max - min));
    }

    /**
     * Исчерпать камень: спрятать объект и уведомить клиентов
     */
    depleteRock(index) {
        this.rockState[index] = {
            depleted: true,
            respawnAt: Date.now() + this.randomRespawnDelay(),
        };
        locationService.hideRock(index);
        this.broadcastRocks();
        logger.info(`[MiningService] Камень ${index} исчерпан`);
    }

    /**
     * Проверка респавна (каждые 3 сек)
     */
    respawnCheck() {
        const now = Date.now();
        let changed = false;
        this.rockState.forEach((st, i) => {
            if (st.depleted && now >= st.respawnAt) {
                this.rockState[i] = { depleted: false, respawnAt: 0 };
                locationService.showRock(i);
                changed = true;
                logger.info(`[MiningService] Камень ${i} заспавнен заново`);
            }
        });
        if (changed) this.broadcastRocks();
    }

    /**
     * Актуальное состояние камней всем игрокам
     */
    broadcastRocks() {
        if (typeof mp === 'undefined' || !mp.players) return;
        const active = this.getRocksActive();
        mp.players.forEach((p) => p.call('client:mining:rocksUpdate', [JSON.stringify(active)]));
    }

    getRocksActive() {
        return this.rockState.map((s) => !s.depleted);
    }

    getShiftCount(playerId) {
        return this.shiftStats.get(playerId) || 0;
    }
}

module.exports = new MiningService();
