const Vehicle = require('../models/Vehicle');
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
    }

    /**
     * Покупка машины
     * @param {number} userId - ID аккаунта
     * @param {string} model - Модель из VehicleConfig
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async buyVehicle(userId, model) {
        const config = VehicleConfig[model];
        if (!config) return { success: false, error: 'unknown_model' };

        const paid = await moneyService.takeMoney(userId, config.price, `покупка ${config.name}`);
        if (!paid) return { success: false, error: 'not_enough_money' };

        await Vehicle.create({ owner_id: userId, model: model });
        logger.info(`[VehicleService] Игрок ID ${userId} купил ${config.name} за $${config.price}`);
        return { success: true, error: null };
    }

    /**
     * Все машины игрока из БД
     * @param {number} userId - ID аккаунта
     * @returns {Promise<Array<Vehicle>>}
     */
    async getPlayerVehicles(userId) {
        return await Vehicle.findAll({ where: { owner_id: userId } });
    }

    /**
     * Машина с проверкой владельца
     * @param {number} vehicleDbId - ID машины в БД
     * @param {number} userId - ID аккаунта
     * @returns {Promise<Vehicle|null>}
     */
    async getVehicleForOwner(vehicleDbId, userId) {
        return await Vehicle.findOne({ where: { id: vehicleDbId, owner_id: userId } });
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
        veh.vehicleDbId = carData.id;
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
    destroyPlayerVehicles(accountId) {
        const playerCarsSet = this.playerOwnedVehicles.get(accountId);
        if (!playerCarsSet || playerCarsSet.size === 0) return;

        for (const vehicleDbId of playerCarsSet) {
            const vehicleObj = this.spawnedVehicles.get(vehicleDbId);
            if (vehicleObj && mp.vehicles.exists(vehicleObj)) { vehicleObj.destroy() }
            this.spawnedVehicles.delete(vehicleDbId);
        }
        this.playerOwnedVehicles.delete(accountId);
    }
}

module.exports = new VehicleService()