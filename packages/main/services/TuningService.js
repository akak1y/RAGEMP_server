const Vehicle = require('../models/Vehicle');
const { TuningConfig, CarCustomPos } = require('../config');
const vehicleService = require('./VehicleService');
const moneyService = require('./MoneyService');
const logger = require('../logger');

/**
 * Сервис тюнинга транспорта (LSC)
 * 
 * Примечание: это game-world сервис — работает с измерениями и переменными машин
 */
class TuningService {
    constructor() {
        this.tuningVehicles = new Map()
    }

    /**
     * Серверная цена опции
     * @param {string} categoryKey - color | wheels | performance
     * @param {Object} option - Опция тюнинга
     * @returns {number} Цена
     */
    getPrice(categoryKey, option) {
        if (categoryKey === 'color') return TuningConfig.color;
        if (categoryKey === 'wheels') return TuningConfig.wheels;
        if (categoryKey === 'performance') return TuningConfig.performance[option.type] || 0;
        return 0;
    }

    /**
     * Валидация опции тюнинга
     * @param {string} categoryKey - Категория
     * @param {Object} option - Опция
     * @returns {boolean}
     */
    validateOption(categoryKey, option) {
        if (!option || typeof option !== 'object') return false;

        if (categoryKey === 'color') return [option.r, option.g, option.b].every(v => Number.isInteger(v) && v >= 0 && v <= 255);
        if (categoryKey === 'wheels') return Number.isInteger(option.type) && Number.isInteger(option.id);
        if (categoryKey === 'performance') {
            const allowedTypes = Object.keys(TuningConfig.performance).map(Number);
            return allowedTypes.includes(Number(option.type)) && Number.isInteger(option.id);
        }
        return false;
    }

    /**
     * Покупка и применение тюнинга
     * @param {mp.Player} player - Игрок
     * @param {mp.Vehicle} veh - Машина
     * @param {string} categoryKey - Категория
     * @param {Object} option - Опция (распарсенный JSON)
     * @param {number} clientPrice - Цена, присланная клиентом
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async buyUpgrade(player, veh, categoryKey, option, clientPrice) {
        if (!this.validateOption(categoryKey, option)) {
            logger.warn(`[TuningService] Некорректная опция "${categoryKey}" от игрока ${player.accountName}`);
            return { success: false, error: 'invalid_option' };
        }

        const realPrice = this.getPrice(categoryKey, option);
        if (clientPrice !== realPrice) logger.warn(`[Cheat Detect] Игрок ${player.accountName} прислал цену $${clientPrice} за ${categoryKey}, серверная цена $${realPrice}`);

        const carData = await vehicleService.getVehicleForOwner(veh.vehicleDbId, player.accountId);
        if (!carData) return { success: false, error: 'not_owner' };

        const paid = await moneyService.takeMoney(player.accountId, realPrice, `тюнинг: ${categoryKey}`);
        if (!paid) return { success: false, error: 'not_enough_money' };

        player.applyMoneyDelta(-realPrice);
        logger.info(`[TuningService] Игрок ${player.accountName} купил ${categoryKey} за $${realPrice}`);
        return { success: true, error: null };
    }

    /**
     * Внутреннее применение тюнинга
     * @private
     */
    async _applyUpgrade(veh, categoryKey, option) {
        const vehicleDbId = veh.vehicleDbId;

        if (categoryKey === 'color') {
            await Vehicle.update({
                color_r: option.r, color_g: option.g, color_b: option.b
            }, { where: { id: vehicleDbId } });
            veh.setVariable("customColor", { r: option.r, g: option.g, b: option.b });
        }

        if (categoryKey === 'performance') {
            const modFields = { 11: 'engine_mod', 12: 'brakes_mod', 13: 'transmission_mod', 18: 'turbo_mod' };
            const dbField = modFields[option.type];
            if (dbField) {
                await Vehicle.update({ [dbField]: option.id }, { where: { id: vehicleDbId } });
                veh.setVariable(`customMod_${option.type}`, option.id);
            }
        }

        if (categoryKey === 'wheels') {
            await Vehicle.update({ wheel_type: option.type, wheel_mod: option.id }, { where: { id: vehicleDbId } });
            veh.setVariable("customWheels", { type: option.type, id: option.id });
        }
    }

    /**
     * Вход в тюнинг-зону
     * @param {mp.Player} player - Игрок
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async enterTuning(player) {
        const veh = player.vehicle;
        if (!veh || !veh.vehicleDbId) return { success: false, error: 'no_vehicle' };

        const carData = await vehicleService.getVehicleForOwner(veh.vehicleDbId, player.accountId);
        if (!carData) return { success: false, error: 'not_owner' };

        this.tuningVehicles.set(player.accountId, veh);
        player.dimension = player.id;
        veh.dimension = player.id;
        return { success: true, error: null };
    }

    /**
     * Выход из тюнинг-зоны
     * @param {mp.Player} player - Игрок
     */
    exitTuning(player) {
        const veh = this.tuningVehicles.get(player.accountId);

        if (veh && mp.vehicles.exists(veh)) {
            veh.position = new mp.Vector3(CarCustomPos.x, CarCustomPos.y, CarCustomPos.z);
            veh.rotation = new mp.Vector3(0.0, 0.0, CarCustomPos.h);
            veh.dimension = 0;
        }
        this.tuningVehicles.delete(player.accountId);
        player.dimension = 0;
    }
}

module.exports = new TuningService();