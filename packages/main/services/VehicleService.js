const { getVehicleModel } = require('../models/Vehicle');
const { VehicleConfig } = require('../config');
const moneyService = require('./MoneyService');
const logger = require('../logger');

/**
 * Сервис управления транспортом
 * 
 * Примечание: это game-world сервис - использует mp.vehicles
 */
class VehicleService {
    constructor() {
        this.spawnedVehicles = new Map();
        this.playerOwnedVehicles = new Map();
        this.lastFuelTick = Date.now();
        this.fuelTimer = null;
        this.startFuelTick();
    }

    /**
     * Покупка машины
     * @param {number} userId - ID аккаунта
     * @param {string} model - Модель из VehicleConfig
     * @param {Object} [transaction] - Sequelize-транзакция (если null — автокоммит)
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async buyVehicle(userId, model, transaction = null) {
        const config = VehicleConfig[model];
        if (!config) return { success: false, error: 'unknown_model' };

        await getVehicleModel().create( { owner_id: userId, model: model, fuel: 100 }, { transaction } );
        logger.info(`[VehicleService] Игрок ID ${userId} купил ${config.name}`);
        return { success: true, error: null };
    }

    /**
     * Все машины игрока из БД
     * @param {number} userId - ID аккаунта
     * @returns {Promise<Array<Vehicle>>}
     */
    async getPlayerVehicles(userId) {
        return await getVehicleModel().findAll({ where: { owner_id: userId } });
    }

    /**
     * Машина с проверкой владельца
     * @param {number} vehicleDbId - ID машины в БД
     * @param {number} userId - ID аккаунта
     * @returns {Promise<Vehicle|null>}
     */
    async getVehicleForOwner(vehicleDbId, userId) {
        return await getVehicleModel().findOne({ where: { id: vehicleDbId, owner_id: userId } });
    }

    /**
     * Заспавнена ли машина сейчас в мире
     * @param {number} vehicleDbId - ID машины в БД
     * @returns {boolean}
     */
    isSpawned(vehicleDbId) {
        const old = this.spawnedVehicles.get(vehicleDbId);
        return !!(old && mp.vehicles.exists(old));
    }

    /**
     * Спавн машины с применением сохранённого тюнинга + учёт в картах
     * @param {Vehicle} carData - Запись машины из БД
     * @param {mp.Vector3} coords - Точка спавна
     * @param {number} heading - Направление
     * @param {number} dimension - Измерение игрока
     * @returns {mp.Vehicle} Созданный транспорт
     */
    spawnVehicle(carData, coords, heading, dimension) {
        const veh = mp.vehicles.new(mp.joaat(carData.model), coords, {
            heading: heading, engine: true, locked: false, dimension: dimension
        });
        veh.setVariable('fuel', Number(carData.fuel || 100));
        veh.prevPos = veh.position;
        veh.vehicleDbId = carData.id;
        veh.setVariable('dbId', carData.id);
        veh.setVariable("customColor", {
            r: carData.color_r,
            g: carData.color_g,
            b: carData.color_b
        });
        veh.setVariable("customMod_11", carData.engine_mod !== null ? carData.engine_mod : -1);
        veh.setVariable("customMod_12", carData.brakes_mod !== null ? carData.brakes_mod : -1);
        veh.setVariable("customMod_13", carData.transmission_mod !== null ? carData.transmission_mod : -1);
        veh.setVariable("customMod_18", carData.turbo_mod !== null ? carData.turbo_mod : -1);
        veh.setVariable("customWheels", {
            type: carData.wheel_type !== null ? carData.wheel_type : 0,
            id: carData.wheel_mod !== null ? carData.wheel_mod : -1
        });

        this.spawnedVehicles.set(carData.id, veh);
        this._trackOwner(carData.owner_id, carData.id);
        return veh;
    }

    /**
     * Внутренний учёт машины за владельцем
     * @private
     */
    _trackOwner(accountId, vehicleDbId) {
        let playerCars = this.playerOwnedVehicles.get(accountId);
        if (!playerCars) {
            playerCars = new Set();
            this.playerOwnedVehicles.set(accountId, playerCars);
        }
        playerCars.add(vehicleDbId);
    }

    /**
     * Деспаун всех машин игрока
     * @param {number} accountId - ID аккаунта
     */
    async destroyPlayerVehicles(accountId) {
        const playerCarsSet = this.playerOwnedVehicles.get(accountId);
        if (!playerCarsSet || playerCarsSet.size === 0) return;

        for (const vehicleDbId of playerCarsSet) {
            const vehicleObj = this.spawnedVehicles.get(vehicleDbId);
            try {
                await getVehicleModel().update(
                    { fuel: vehicleObj.getVariable('fuel') },
                    { where: { id: vehicleDbId } }
                )
            } catch (e) {}
            if (vehicleObj && mp.vehicles.exists(vehicleObj)) { vehicleObj.destroy() }
            this.spawnedVehicles.delete(vehicleDbId);
        }
        this.playerOwnedVehicles.delete(accountId);
    }

    getConsumptionRate(kmh) {
        return 0.01 + 0.003 * Math.max(0, kmh);
    }

    tickFuel() {
        const now = Date.now();
        const dt = (now - this.lastFuelTick) / 1000;
        this.lastFuelTick = now;
        if (dt <= 0) return;

        for (const [dbId, veh] of this.spawnedVehicles) {
            try {
                if (veh.getVariable('courierWork')) continue;
                if (!veh || !mp.vehicles.exists(veh)) continue;
                const driver = veh.getOccupants().find(p => p.seat === 0);
                if (!driver) continue;

                const pos = veh.position;
                let kmh = 0;
                const prev = veh.prevPos;
                if (prev) kmh = Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z) / dt * 3.6;
                veh.prevPos = pos;

                const rate = this.getConsumptionRate(kmh);
                const delta = rate * dt;
                const current = Number(veh.getVariable('fuel') || 0);
                const next = Math.max(0, current - delta);
                veh.setVariable('fuel', next);

                if (next <= 0 && current > 0) {
                    veh.engine = false;
                    if (driver && driver.outputChatBox) driver.outputChatBox('!{#FF3333}[Топливо] Бак пуст — нужна заправка!');
                }
            } catch (e) {}
        }
    }

    startFuelTick() {
        if (this.fuelTimer) return;
        this.lastFuelTick = Date.now();
        this.fuelTimer = setInterval(() => this.tickFuel(), 1000)
    }

    /**
     * Заправить машину до 100
     * @param {number} vehicleDbId
     * @param {number} ownerId
     */
    async refuelVehicle(vehicleDbId, ownerId) {     
        const veh = await this.getVehicleForOwner(vehicleDbId, ownerId);
        if (!veh) return { success: false, error: 'not_found' };

        const current = Number(veh.fuel);
        if (current >= 100) return { success: false, error: 'full' };

        await getVehicleModel().update({ fuel: 100 }, { where: { id: vehicleDbId } });

        const spawned = this.spawnedVehicles.get(vehicleDbId);
        if (spawned && mp.vehicles.exists(spawned)) spawned.setVariable('fuel', 100);
        return { success: true, liters: 100 - current }
    }
}

module.exports = new VehicleService()