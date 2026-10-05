const { getVehicleModel } = require('../models/Vehicle');
const { VehicleConfig } = require('../config');
const logger = require('../core/logger');

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
     * Безопасная проверка, что объект транспорта ещё жив в мире.
     * @private
     */
    _vehicleExists(veh) {
        try {
            return !!(
                veh &&
                typeof mp !== 'undefined' &&
                mp.vehicles &&
                typeof mp.vehicles.exists === 'function' &&
                mp.vehicles.exists(veh)
            );
        } catch {
            return false;
        }
    }

    /**
     * Нормализация значения топлива в диапазон 0..100.
     * @private
     */
    _normalizeFuel(value, fallback = 100) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0, Math.min(100, n));
    }

    /**
     * Безопасное чтение текущего топлива из сетевой переменной машины.
     * @private
     */
    _readFuel(veh, dbId = null) {
        try {
            const raw = veh.getVariable('fuel');
            return this._normalizeFuel(raw, 100);
        } catch (err) {
            const suffix = dbId !== null && dbId !== undefined ? ` машины ${dbId}` : '';
            logger.error(`[VehicleService] не удалось прочитать топливо${suffix}: ${err.message}`);
            return 100;
        }
    }

    /**
     * Публичный доступ к текущему топливу заспавненной машины.
     * @param {mp.Vehicle} veh
     * @param {number} [dbId] - ID машины в БД для более точного лога
     * @returns {number}
     */
    getFuel(veh, dbId = null) {
        return this._readFuel(veh, dbId);
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

        await getVehicleModel().create(
            { owner_id: userId, model: model, fuel: 100 },
            { transaction }
        );
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
        return this._vehicleExists(old);
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
            heading: heading,
            engine: true,
            locked: false,
            dimension: dimension,
        });

        veh.setVariable('fuel', this._normalizeFuel(carData.fuel, 100));
        veh.prevPos = { x: veh.position.x, y: veh.position.y, z: veh.position.z };
        veh.vehicleDbId = carData.id;
        veh.setVariable('dbId', carData.id);
        veh.setVariable('customColor', {
            r: carData.color_r,
            g: carData.color_g,
            b: carData.color_b,
        });
        veh.setVariable('customMod_11', carData.engine_mod !== null ? carData.engine_mod : -1);
        veh.setVariable('customMod_12', carData.brakes_mod !== null ? carData.brakes_mod : -1);
        veh.setVariable(
            'customMod_13',
            carData.transmission_mod !== null ? carData.transmission_mod : -1
        );
        veh.setVariable('customMod_18', carData.turbo_mod !== null ? carData.turbo_mod : -1);
        veh.setVariable('customWheels', {
            type: carData.wheel_type !== null ? carData.wheel_type : 0,
            id: carData.wheel_mod !== null ? carData.wheel_mod : -1,
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
    async despawnPlayerVehicles(accountId) {
        const playerCarsSet = this.playerOwnedVehicles.get(accountId);
        if (!playerCarsSet || playerCarsSet.size === 0) return;

        for (const vehicleDbId of [...playerCarsSet]) {
            try {
                await this.despawnVehicle(vehicleDbId);
            } catch (err) {
                logger.error(
                    `[VehicleService] despawnPlayerVehicles: не удалось деспаунить машину ${vehicleDbId}: ${err.message}`
                );
            }
        }
    }

    /**
     * Расход топлива: литров в секунду в зависимости от скорости
     * @param {number} kmh - Скорость, км/ч
     * @returns {number} Литров в секунду
     */
    getConsumptionRate(kmh) {
        return 0.01 + 0.003 * Math.max(0, kmh);
    }

    /**
     * Тик расхода (раз в секунду): у машин с водителем списывает топливо,
     * при нуле глушит двигатель. Рабочий транспорт (courierWork) не тратит.
     * @private
     */
    tickFuel() {
        const now = Date.now();
        const dt = (now - this.lastFuelTick) / 1000;
        this.lastFuelTick = now;
        if (dt <= 0) return;

        for (const [dbId, veh] of this.spawnedVehicles) {
            try {
                if (!this._vehicleExists(veh)) continue;
                if (veh.getVariable('courierWork')) continue;
                const driver = veh.getOccupants().find((p) => p.seat === 0);
                if (!driver) continue;

                const pos = veh.position;
                let kmh = 0;
                const prev = veh.prevPos;
                if (prev)
                    kmh = (Math.hypot(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z) / dt) * 3.6;
                veh.prevPos = pos;

                const rate = this.getConsumptionRate(kmh);
                const delta = rate * dt;
                const current = this._readFuel(veh, dbId);
                const next = Math.max(0, current - delta);
                veh.setVariable('fuel', next);

                if (next <= 0 && current > 0) {
                    veh.engine = false;
                    if (driver && driver.outputChatBox)
                        driver.outputChatBox('!{#FF3333}[Топливо] Бак пуст — нужна заправка!');
                }
            } catch (err) {
                logger.error(`[VehicleService] tickFuel error: ${err.message}`);
            }
        }
    }

    /**
     * Запускает интервал тика топлива (повторный вызов игнорируется)
     */
    startFuelTick() {
        if (this.fuelTimer) return;
        this.lastFuelTick = Date.now();
        this.fuelTimer = setInterval(() => this.tickFuel(), 1000);
        if (this.fuelTimer.unref) this.fuelTimer.unref();
    }

    /**
     * Заправить машину до 100
     * @param {number} vehicleDbId
     * @param {number} ownerId
     * @param {Object} [transaction]
     * @returns {Promise<{success: boolean, error?: string, liters?: number, fuel?: number}>}
     */
    async refuelVehicle(vehicleDbId, ownerId, transaction = null) {
        const vehDb = await this.getVehicleForOwner(vehicleDbId, ownerId);
        if (!vehDb) return { success: false, error: 'not_found' };
        const spawned = this.spawnedVehicles.get(vehicleDbId);
        if (!this._vehicleExists(spawned)) return { success: false, error: 'not_spawned' };
        const current = this._readFuel(spawned, vehicleDbId);
        if (current >= 100) return { success: false, error: 'full' };
        const liters = Math.max(0, 100 - current);
        try {
            await getVehicleModel().update(
                { fuel: 100 },
                { where: { id: vehicleDbId }, transaction }
            );
        } catch (err) {
            logger.error(`[VehicleService] refuelVehicle fuel save error: ${err.message}`);
            return { success: false, error: 'db_error' };
        }
        if (!transaction) {
            this.setFuel(vehicleDbId, 100);
        }
        return { success: true, liters, fuel: 100 };
    }

    /**
     * Установить топливо заспавненной машине
     * @param {number} dbId - ID машины в БД
     * @param {number} value - новое топливо 0..100
     * @param {Object} [transaction] - Sequelize-транзакция
     * @returns {boolean} true, если машина была в мире
     */
    setFuel(dbId, value, _transaction = null) {
        const fuel = Number(value);
        if (!Number.isFinite(fuel)) {
            logger.warn(`[VehicleService] setFuel: некорректное значение топлива ${value}`);
            return false;
        }
        const veh = this.spawnedVehicles.get(dbId);
        if (!this._vehicleExists(veh)) return false;
        try {
            veh.setVariable('fuel', this._normalizeFuel(fuel, 100));
            return true;
        } catch (err) {
            logger.error(
                `[VehicleService] setFuel: не удалось обновить сетевое топливо машины ${dbId}: ${err.message}`
            );
            return false;
        }
    }

    /**
     * Деспаун одной машины
     * @param {number} dbId - ID машины в БД
     */
    async despawnVehicle(dbId) {
        const veh = this.spawnedVehicles.get(dbId);
        if (!veh) return;
        const fuel = this._readFuel(veh, dbId);
        try {
            await getVehicleModel().update({ fuel }, { where: { id: dbId } });
        } catch (err) {
            logger.error(`[VehicleService] despawnVehicle fuel save error: ${err.message}`);
        }

        try {
            if (this._vehicleExists(veh)) veh.destroy();
        } catch (err) {
            logger.error(
                `[VehicleService] despawnVehicle: не удалось destroy машины ${dbId}: ${err.message}`
            );
        }

        this.spawnedVehicles.delete(dbId);
        for (const [accountId, cars] of this.playerOwnedVehicles) {
            if (cars.has(dbId)) {
                cars.delete(dbId);
                if (cars.size === 0) this.playerOwnedVehicles.delete(accountId);
                break;
            }
        }
    }

    /**
     * Респавн машины
     * @param {number} dbId - id записи машины
     * @returns {boolean} true, если машина была пересоздана
     */
    async respawnVehicle(dbId) {
        if (!this.isSpawned(dbId)) return false;

        const veh = this.spawnedVehicles.get(dbId);
        let coords;
        let heading;
        let dimension;
        try {
            coords = veh.position;
            heading = veh.heading;
            dimension = veh.dimension;
        } catch (err) {
            logger.error(
                `[VehicleService] respawnVehicle: не удалось прочитать состояние машины ${dbId}: ${err.message}`
            );
            await this.despawnVehicle(dbId);
            return false;
        }

        await this.despawnVehicle(dbId);

        const carData = await getVehicleModel().findByPk(dbId);
        if (!carData) return false;

        this.spawnVehicle(carData, coords, heading, dimension);
        return true;
    }
}

module.exports = new VehicleService();
