const { HospitalPos } = require('../config');
const logger = require('../core/logger');

const RESPAWN_DELAY_MS = 5000; // без сознания
const MAX_HEALTH = 100;

/**
 * HealthService — здоровье, смерть и респаун
 */
class HealthService {
    onPlayerDeath(player) {
        player.outputChatBox('!{#FF3333}Вы потеряли сознание. Очнётесь в больнице через 5 секунд...');
        setTimeout(() => {
            if (!mp.players.exists(player)) return; // если вышел с сервера без сознания
            this.respawnAtHospital(player);
        }, RESPAWN_DELAY_MS);
    }

    respawnAtHospital(player) {
        player.spawn(new mp.Vector3(HospitalPos.x, HospitalPos.y, HospitalPos.z));
        player.heading = HospitalPos.h;
        player.dimension = 0;
        player.removeAllWeapons();
        player.health = MAX_HEALTH;
        player.outputChatBox('!{#00FF00}[Больница] Вы очнулись. Будьте осторожнее!');
        logger.info(`Игрок ${player.accountName} возрождён в больнице`);
    }

    setHealth(player, value) {
        const hp = Math.max(0, Math.min(MAX_HEALTH, Number(value))); // защита от 100+ hp
        player.health = hp;
        return hp;
    }
}

module.exports = new HealthService()