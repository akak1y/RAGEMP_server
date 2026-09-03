const { HospitalPos } = require('../config');
const logger = require('../core/logger');

const RESPAWN_DELAY_MS = 5000; // без сознания
const MAX_HEALTH = 100;

/**
 * HealthService — здоровье, смерть, респаун и лечение.
 * Единая точка для всего, что касается HP.
 */
class HealthService {
    constructor() {
        this._deathTimers = new Map(); // accountId → timeout
    }

    onPlayerDeath(player) {
        player.outputChatBox(
            '!{#FF3333}Вы потеряли сознание. Очнётесь в больнице через 5 секунд...'
        );
        const timer = setTimeout(() => {
            this._deathTimers.delete(player.accountId);
            if (!mp.players.exists(player)) return; // если вышел с сервера без сознания
            this.respawnAtHospital(player);
        }, RESPAWN_DELAY_MS);
        this._deathTimers.set(player.accountId, timer);
    }

    onDisconnect(accountId) {
        const timer = this._deathTimers.get(accountId);
        if (timer) {
            clearTimeout(timer);
            this._deathTimers.delete(accountId);
        }
    }

    respawnAtHospital(player) {
        player.spawn(new mp.Vector3(HospitalPos.x, HospitalPos.y, HospitalPos.z));
        player.heading = HospitalPos.h;
        player.dimension = 0;
        player.removeAllWeapons();
        this.heal(player);
        player.outputChatBox('!{#00FF00}[Больница] Вы очнулись. Будьте осторожнее!');
        logger.info(`Игрок ${player.accountName} возрождён в больнице`);
    }

    /**
     * Низкоуровневое присваивание HP с clamp.
     */
    setHealth(player, value) {
        const hp = Math.max(0, Math.min(MAX_HEALTH, Number(value))); // защита от 100+ hp
        player.health = hp;
        return hp;
    }

    /**
     * Бизнес-метод: восстановление до targetHp.
     */
    heal(player, targetHp = MAX_HEALTH) {
        const hp = this.setHealth(player, targetHp);
        logger.info(`[HealthService] Игрок ${player.accountName} вылечен до ${hp} HP`);
        return hp;
    }

    /**
     * Лечение за деньги: единая точка для платного восстановления.
     */
    async healForMoney(player, price, reason = 'лечение') {
        if (!Number.isFinite(price) || price <= 0) {
            return { success: false, error: 'invalid_price' };
        }

        const paid = await player.takeMoney(price, reason);
        if (!paid) return { success: false, error: 'not_enough_money' };

        const newHealth = this.heal(player);
        return { success: true, newHealth };
    }
}

module.exports = new HealthService();
