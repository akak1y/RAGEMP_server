const { getVehicleModel } = require('../models/Vehicle');
const { TuningConfig, CarCustomPos } = require('../config');
const vehicleService = require('./VehicleService');
const moneyService = require('./MoneyService');
const logger = require('../core/logger');

/**
 * Сервис тюнинга транспорта (LSC)
 *
 * Примечание: это game-world сервис — работает с измерениями и переменными машин
 */
class TuningService {
    constructor() {
        this.tuningVehicles = new Map();
    }

    /**
     * Поиск цвета в палитре
     * @private
     */
    _findColorOption(option) {
        return (
            TuningConfig.colors.find(
                (c) => c.value.r === option.r && c.value.g === option.g && c.value.b === option.b
            ) || null
        );
    }

    /**
     * Поиск комплекта дисков в каталоге
     * @private
     */
    _findWheelOption(option) {
        return (
            TuningConfig.wheels.options.find(
                (o) => o.wheelType === option.wheelType && o.wheelId === option.wheelId
            ) || null
        );
    }

    /**
     * Серверная цена категории/опции
     * @param {string} categoryKey - color | engine | brakes | transmission | turbo | wheels
     * @param {Object} [option] - Опция (для color и wheels)
     * @returns {number} Цена
     */
    getPrice(categoryKey, option = {}) {
        if (categoryKey === 'color') return TuningConfig.colorPrice;

        const perf = TuningConfig.performanceMods[categoryKey];
        if (perf) return perf.price;

        if (categoryKey === 'wheels') {
            const opt = this._findWheelOption(option);
            return opt ? opt.price : 0;
        }
        return 0;
    }

    /**
     * Проверка "уже установлено"
     * @param {Object} carData - Запись машины из БД
     * @param {string} categoryKey - Категория
     * @param {Object} [option] - Опция (для color и wheels)
     * @returns {boolean}
     */
    isInstalled(carData, categoryKey, option = {}) {
        if (categoryKey === 'color')
            return (
                carData.color_r === option.r &&
                carData.color_g === option.g &&
                carData.color_b === option.b
            );
        const perf = TuningConfig.performanceMods[categoryKey];
        if (perf) return carData[perf.currentField] === perf.topLevel;
        if (categoryKey === 'wheels')
            return carData.wheel_type === option.wheelType && carData.wheel_mod === option.wheelId;
        return false;
    }

    /**
     * Покупка и применение тюнинга
     * @param {mp.Player} player - Игрок
     * @param {mp.Vehicle} veh - Машина (с vehicleDbId)
     * @param {string} categoryKey - color | engine | brakes | transmission | turbo | wheels
     * @param {Object} [option] - { r, g, b } для color, { wheelType, wheelId } для wheels
     * @param {number} [clientPrice] - Цена от клиента
     * @param {Object} [transaction] - Sequelize-транзакция (если null — автокоммит)
     * @returns {Promise<{success: boolean, error: string|null, realPrice: number|null, variables?: Array<{key: string, value: any}>}>}
     */
    async buyUpgrade(player, veh, categoryKey, option = {}, clientPrice = 0, transaction = null) {
        const carData = await vehicleService.getVehicleForOwner(veh.vehicleDbId, player.accountId);
        if (!carData) return { success: false, error: 'not_owner', realPrice: null };

        if (categoryKey === 'color' && !this._findColorOption(option)) {
            logger.warn(`[TuningService] Некорректный цвет от игрока ${player.accountName}`);
            return { success: false, error: 'invalid_option', realPrice: null };
        }
        if (categoryKey === 'wheels' && !this._findWheelOption(option)) {
            logger.warn(
                `[TuningService] Некорректный комплект дисков от игрока ${player.accountName}`
            );
            return { success: false, error: 'invalid_option', realPrice: null };
        }
        if (
            categoryKey !== 'color' &&
            categoryKey !== 'wheels' &&
            !TuningConfig.performanceMods[categoryKey]
        ) {
            logger.warn(
                `[TuningService] Некорректная категория "${categoryKey}" от игрока ${player.accountName}`
            );
            return { success: false, error: 'invalid_category', realPrice: null };
        }

        if (this.isInstalled(carData, categoryKey, option))
            return { success: false, error: 'already_installed', realPrice: null };

        const realPrice = this.getPrice(categoryKey, option);
        if (clientPrice !== realPrice)
            logger.warn(
                `[Cheat Detect] Игрок ${player.accountName} прислал цену $${clientPrice} за ${categoryKey}, серверная цена $${realPrice}`
            );

        const paid = await moneyService.takeMoney(
            player.accountId,
            realPrice,
            `тюнинг: ${categoryKey}`,
            transaction
        );
        if (!paid) return { success: false, error: 'not_enough_money', realPrice: null };

        const variables = await this._applyUpgrade(veh, categoryKey, option, transaction);
        if (!transaction) {
            this.applyVariables(veh, variables);
        }

        logger.info(
            `[TuningService] Игрок ${player.accountName} установил ${categoryKey} за $${realPrice}`
        );
        const result = { success: true, error: null, realPrice };
        if (transaction) {
            result.variables = variables;
        }

        return result;
    }

    /**
     * Внутреннее применение тюнинга к БД.
     * @private
     */
    async _applyUpgrade(veh, categoryKey, option, transaction = null) {
        const VehicleModel = getVehicleModel();
        const vehicleDbId = veh.vehicleDbId;

        if (categoryKey === 'color') {
            await VehicleModel.update(
                {
                    color_r: option.r,
                    color_g: option.g,
                    color_b: option.b,
                },
                { where: { id: vehicleDbId }, transaction }
            );
            return [
                {
                    key: 'customColor',
                    value: { r: option.r, g: option.g, b: option.b },
                },
            ];
        }

        const perf = TuningConfig.performanceMods[categoryKey];
        if (perf) {
            await VehicleModel.update(
                { [perf.currentField]: perf.topLevel },
                { where: { id: vehicleDbId }, transaction }
            );
            return [
                {
                    key: `customMod_${perf.modType}`,
                    value: perf.topLevel,
                },
            ];
        }

        if (categoryKey === 'wheels') {
            await VehicleModel.update(
                {
                    wheel_type: option.wheelType,
                    wheel_mod: option.wheelId,
                },
                { where: { id: vehicleDbId }, transaction }
            );
            return [
                {
                    key: 'customWheels',
                    value: { type: option.wheelType, id: option.wheelId },
                },
            ];
        }

        return [];
    }

    /**
     * Публикация сетевых переменных машины.
     * @param {mp.Vehicle} veh
     * @param {Array<{key: string, value: any}>} variables
     */
    applyVariables(veh, variables) {
        if (!veh || typeof veh.setVariable !== 'function') return;
        if (!Array.isArray(variables)) return;

        for (const change of variables) {
            if (!change || change.key === undefined) continue;

            try {
                veh.setVariable(change.key, change.value);
            } catch (err) {
                logger.error(
                    `[TuningService] Не удалось применить переменную ${change.key}: ${err.message}`
                );
            }
        }
    }

    /**
     * Текущее состояние тюнинга машины
     * @param {Object} carData - Запись машины из БД
     * @returns {Object}
     */
    getTuningState(carData) {
        return {
            color: { r: carData.color_r, g: carData.color_g, b: carData.color_b },
            engine: carData.engine_mod,
            brakes: carData.brakes_mod,
            transmission: carData.transmission_mod,
            turbo: carData.turbo_mod,
            wheels: { wheelType: carData.wheel_type, wheelId: carData.wheel_mod },
        };
    }

    /**
     * Вход в тюнинг-зону
     * @param {mp.Player} player - Игрок
     * @returns {Promise<{success: boolean, error: string|null, carData: Object|null}>}
     */
    async enterTuning(player) {
        const veh = player.vehicle;
        if (!veh || !veh.vehicleDbId) return { success: false, error: 'no_vehicle', carData: null };

        const carData = await vehicleService.getVehicleForOwner(veh.vehicleDbId, player.accountId);
        if (!carData) return { success: false, error: 'not_owner', carData: null };

        this.tuningVehicles.set(player.accountId, veh);
        player.dimension = player.id;
        veh.dimension = player.id;
        return { success: true, error: null, carData };
    }

    /**
     * Выход из тюнинг-зоны
     * @param {mp.Player} player - Игрок
     */
    exitTuning(player) {
        if (!player || !player.accountId) return;
        const veh = this.tuningVehicles.get(player.accountId);

        try {
            if (
                veh &&
                typeof mp !== 'undefined' &&
                mp.vehicles &&
                typeof mp.vehicles.exists === 'function' &&
                mp.vehicles.exists(veh)
            ) {
                veh.position = new mp.Vector3(CarCustomPos.x, CarCustomPos.y, CarCustomPos.z);
                veh.rotation = new mp.Vector3(0.0, 0.0, CarCustomPos.h);
                veh.dimension = 0;
            }
        } catch (err) {
            logger.error(
                `[TuningService] Не удалось корректно вывести машину из LSC для игрока ${player.accountName || player.accountId}: ${err.message}`
            );
        }

        this.tuningVehicles.delete(player.accountId);

        try {
            player.dimension = 0;
        } catch (err) {
            logger.warn(
                `[TuningService] Не удалось вернуть игрока ${player.accountName || player.accountId} в dimension 0: ${err.message}`
            );
        }
    }

    /**
     * Очистка сессионного состояния LSC при выходе игрока.
     * @param {mp.Player} player - Игрок
     */
    cleanupOnQuit(player) {
        if (!player || !player.accountId) return;
        this.tuningVehicles.delete(player.accountId);
    }

    /**
     * Находится ли игрок внутри мастерской (LSC) со своей машиной.
     * @param {mp.Player} player - Игрок
     * @returns {boolean}
     */
    isInShop(player) {
        if (!player || !player.accountId) return false;
        const veh = this.tuningVehicles.get(player.accountId);
        return !!(veh && mp.vehicles.exists(veh) && player.vehicle === veh);
    }
}

module.exports = new TuningService();
