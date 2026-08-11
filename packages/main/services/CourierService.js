const { CourierConfig } = require('../config');
const auditService = require('./AuditService');
const logger = require('../logger');

/**
 * Работа «Курьер»
 */
class CourierService {
    constructor() {
        this.states = new Map(); // accountId → { stage, pointIdx, vehicleId }
    }

    isWorking(accountId) {
        return this.states.has(accountId)
    } 

    interact(player) {
        if (player.vehicle) return player.outputChatBox('!{#FF3333}[Курьер] Выйдите из транспорта.');

        const st = this.states.get(player.accountId);
        if (!st) {
            if (this.isNear(player.position, CourierConfig.pickupPos)) this.startWork(player);
            return;
        }

        const veh = mp.vehicles.at(st.vehicleId);
        if (!veh || !mp.vehicles.exists(veh)) {
            this.endWork(player.accountId, true);
            return player.outputChatBox('!{#FF3333}[Курьер] Рабочий транспорт потерян. Работа завершена.');
        }

        if (st.stage === 'delivery') {
            const point = CourierConfig.deliveryPoints[st.pointIdx];
            if (this.isNear(player.position, point)) this.dropOff(player, st);
        } else if (st.stage === 'return') {
            if (this.isNear(player.position, CourierConfig.pickupPos)) this.completeOrder(player, st);
        }
    }

    startWork(player) {
        const spawn = CourierConfig.vehicleSpawnPos;
        const veh = mp.vehicles.new(mp.joaat(CourierConfig.vehicleModel), new mp.Vector3(spawn.x, spawn.y, spawn.z), { heading: spawn.h });
        veh.setVariable('courierWork', player.accountId);
        veh.setVariable('fuel', 100);

        const st = { stage: 'delivery', pointIdx: this.randomPoint(-1), vehicleId: veh.id };
        this.states.set(player.accountId, st);

        this.sendTarget(player, st);
        player.outputChatBox('!{#00FF00}[Курьер] Работа начата. Транспорт выдан, точка доставки на карте.');
        logger.info(`[CourierService] Игрок ${player.accountName} начал работу курьером`);
    }

    dropOff(player, st) {
        st.stage = 'return';
        this.sendTarget(player, st);
        player.outputChatBox('!{#00FFFF}[Курьер] Посылка доставлена. Возвращайся на склад.');
    }

    completeOrder(player, st) {
        player.addMoney(CourierConfig.payPerDelivery, 'курьерская доставка');
        auditService.logPlayer(player, 'courier', {
            category: 'money', amount: CourierConfig.payPerDelivery,
            details: { point: st.pointIdx }
        });
        player.outputChatBox(`!{#00FF00}[Курьер] Заказ выполнен: +$${CourierConfig.payPerDelivery}. Новый заказ!`);

        st.stage = 'delivery';
        st.pointIdx = this.randomPoint(st.pointIdx);
        this.sendTarget(player, st);
    }

    endWork(accountId, silent = false) {
        const st = this.states.get(accountId);
        if (!st) return;

        const veh = mp.vehicles.at(st.vehicleId);
        if (veh && mp.vehicles.exists(veh)) veh.destroy();
        this.states.delete(accountId);

        const player = mp.players.toArray().find(p => p.accountId === accountId);
        if (player) {
            player.call('client:courier:target', [null]);
            if (!silent) player.outputChatBox('!{#FFFF00}[Курьер] Работа завершена. Транспорт возвращён.');
        }
    }

    sendTarget(player, st) {
        if (st.stage === 'delivery') {
            const p = CourierConfig.deliveryPoints[st.pointIdx];
            player.call('client:courier:target', [p.x, p.y, p.z]);
        } else {
            player.call('client:courier:target', [null]);
        }
    }

    randomPoint(exceptIdx) { // случайная точка
        const n = CourierConfig.deliveryPoints.length;
        if (n === 1) return 0;
        let idx;
        do { idx = Math.floor(Math.random() * n); } while (idx === exceptIdx);
        return idx;
    }

    isNear(pos, point, radius = CourierConfig.interactRadius) {
        if (!pos || !point) return false;
        const dx = pos.x - point.x, dy = pos.y - point.y, dz = pos.z - point.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius;
    }
}

module.exports = new CourierService();