const { CourierConfig } = require('../config');
const auditService = require('./AuditService');
const { isNear } = require('../utils/distance');
const logger = require('../core/logger');

/**
 * Работа «Курьер»
 */
class CourierService {
    constructor() {
        this.states = new Map(); // accountId → { stage, pointIdx, vehicleId, pay }
    }

    isWorking(accountId) {
        return this.states.has(accountId);
    }

    interact(player) {
        if (player.vehicle)
            return player.outputChatBox('!{#FF3333}[Курьер] Выйдите из транспорта.');

        const st = this.states.get(player.accountId);
        if (!st) {
            if (isNear(player.position, CourierConfig.startPos)) this.startWork(player);
            return;
        }

        const veh = mp.vehicles.at(st.vehicleId);
        if (!veh || !mp.vehicles.exists(veh)) {
            this.endWork(player.accountId, true);
            return player.outputChatBox(
                '!{#FF3333}[Курьер] Рабочий транспорт потерян. Работа завершена.'
            );
        }

        if (isNear(player.position, CourierConfig.startPos)) return this.endWork(player.accountId);

        if (st.stage === 'pickup') {
            if (isNear(player.position, CourierConfig.warehousePos)) this.takePackage(player, st);
        } else if (st.stage === 'delivery') {
            const point = CourierConfig.deliveryPoints[st.pointIdx];
            if (isNear(player.position, point)) this.dropOff(player, st);
        } else if (st.stage === 'return') {
            if (isNear(player.position, CourierConfig.warehousePos)) this.completeOrder(player, st);
        }
    }

    startWork(player) {
        const points = CourierConfig.vehicleSpawnPoints;
        const spawn = points[Math.floor(Math.random() * points.length)];
        const veh = mp.vehicles.new(
            mp.joaat(CourierConfig.vehicleModel),
            new mp.Vector3(spawn.x, spawn.y, spawn.z),
            { heading: spawn.h }
        );
        veh.setVariable('courierWork', player.accountId);
        veh.setVariable('fuel', 100);

        const pointIdx = this.randomPoint(-1);
        const st = { stage: 'pickup', pointIdx, vehicleId: veh.id, pay: this.calcPay(pointIdx) };
        this.states.set(player.accountId, st);

        this.sendTarget(player, st);
        player.outputChatBox(
            `!{#00FF00}[Курьер] Работа начата. Транспорт рядом. Возьмите посылку на складе.`
        );
        logger.info(`[CourierService] Игрок ${player.accountName} начал работу курьером`);
    }

    dropOff(player, st) {
        const dist = this.distTo(st.pointIdx);
        const minTimeMs = (dist / CourierConfig.minDeliverySpeed) * 1000;
        const elapsed = Date.now() - (st.deliveryStart || 0);

        if (elapsed < minTimeMs) {
            auditService.logPlayer(player, 'courier_cheat', {
                category: 'security',
                success: false,
                withPosition: true,
                details: {
                    dist: Math.round(dist),
                    elapsed: Math.round(elapsed / 1000),
                    min: Math.round(minTimeMs / 1000),
                },
            });
            return player.outputChatBox(
                '!{#FF3333}[Курьер] Слишком быстро! Пройди маршрут честно.'
            );
        }

        st.stage = 'return';
        this.sendTarget(player, st);
        player.outputChatBox('!{#00FFFF}[Курьер] Посылка доставлена. Возвращайся на склад.');
    }

    takePackage(player, st) {
        st.stage = 'delivery';
        st.deliveryStart = Date.now();
        this.sendTarget(player, st);
        player.outputChatBox(
            `!{#00FFFF}[Курьер] Посылка взята. Точка доставки: ~${Math.round(this.distTo(st.pointIdx))} м, награда $${st.pay}.`
        );
    }

    async completeOrder(player, st) {
        const moneyService = require('./MoneyService');
        const success = await moneyService.addMoney(
            player.accountId,
            st.pay,
            'курьерская доставка'
        );

        if (!success) {
            logger.error(
                `[CourierService] Начисление $${st.pay} игроку ${player.accountId} провалилось`
            );
            return;
        }

        player.money += st.pay;
        player.call('client:updateMoney', [player.money]);

        auditService.logPlayer(player, 'courier', {
            category: 'money',
            amount: st.pay,
            details: { point: st.pointIdx, dist: Math.round(this.distTo(st.pointIdx)) },
        });
        player.outputChatBox(`!{#00FF00}[Курьер] Заказ выполнен: +$${st.pay}.`);

        st.stage = 'delivery';
        st.pointIdx = this.randomPoint(st.pointIdx);
        st.pay = this.calcPay(st.pointIdx);
        this.sendTarget(player, st);
        player.outputChatBox(
            `!{#00FFFF}[Курьер] Новая посылка взята. Точка доставки: ~${Math.round(this.distTo(st.pointIdx))} м, награда $${st.pay}.`
        );
    }

    endWork(accountId, silent = false) {
        const st = this.states.get(accountId);
        if (!st) return;

        const veh = mp.vehicles.at(st.vehicleId);
        if (veh && mp.vehicles.exists(veh)) veh.destroy();
        this.states.delete(accountId);

        const player = mp.players.toArray().find((p) => p.accountId === accountId);
        if (player) {
            player.call('client:courier:target', [null]);
            if (!silent)
                player.outputChatBox('!{#FFFF00}[Курьер] Работа завершена. Транспорт возвращён.');
        }
    }

    sendTarget(player, st) {
        if (st.stage === 'delivery') {
            const p = CourierConfig.deliveryPoints[st.pointIdx];
            player.call('client:courier:target', [p.x, p.y, p.z, 'delivery']);
        } else {
            const w = CourierConfig.warehousePos;
            player.call('client:courier:target', [w.x, w.y, w.z, st.stage]);
        }
    }

    randomPoint(exceptIdx) {
        // случайная точка
        const n = CourierConfig.deliveryPoints.length;
        if (n === 1) return 0;
        let idx;
        do {
            idx = Math.floor(Math.random() * n);
        } while (idx === exceptIdx);
        return idx;
    }

    distTo(pointIdx) {
        const p = CourierConfig.deliveryPoints[pointIdx];
        const w = CourierConfig.warehousePos;
        return Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z);
    }

    calcPay(pointIdx) {
        return (
            Math.round(
                (CourierConfig.payBase + this.distTo(pointIdx) * CourierConfig.payPerMeter) / 10
            ) * 10
        );
    }
}

module.exports = new CourierService();
