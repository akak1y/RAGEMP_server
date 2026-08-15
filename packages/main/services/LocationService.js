const { DealershipPos, GaragePos, CarCustomPos, HospitalPos, FuelStationPos, CourierConfig } = require('../config');
const { isNear } = require('../utils/distance');
const logger = require('../logger');

/**
 * Сервис игровых локаций (маркеры и blips)
 */
class LocationService {
    constructor() {
        this.locations = {
            dealership: {
                pos: DealershipPos,
                blip: { sprite: 225, color: 2, name: 'Автосалон', scale: 1.0 },
                marker: { type: 1, size: 1.5, color: [0, 200, 0, 150], zOffset: -1.0 }
            },
            garage: {
                pos: GaragePos,
                blip: { sprite: 357, color: 74, name: 'Гараж', scale: 1.0 },
                marker: { type: 36, size: 2.0, color: [150, 150, 255, 150], zOffset: -1.0 }
            },
            lsc: {
                pos: CarCustomPos,
                blip: { sprite: 402, color: 46, name: 'LSC', scale: 1.0 },
                marker: { type: 44, size: 1.5, color: [250, 250, 0, 150], zOffset: -1.0 }
            },
            hospital: {
                pos: HospitalPos,
                blip: { sprite: 61, color: 49, name: 'Больница', scale: 1.0 },
                marker: { type: 1, size: 1.5, color: [255, 80, 80, 120], zOffset: -1.0 }
            },
            fuel: {
                pos: FuelStationPos,
                blip: { sprite: 361, color: 15, name: 'Заправка', scale: 0.8 },
                marker: { type: 1, size: 1.0, color: [0, 165, 165, 120], zOffset: -1.0 }
            },
            courier: {
                pos: CourierConfig.startPos,
                blip: { sprite: 478, color: 5, name: 'Курьер', scale: 1.0 },
                marker: { type: 1, size: 1.5, color: [255, 200, 0, 150], zOffset: -1.0 }
            },
        };
    }

    /**
     * Создание всех маркеров и blips на карте
     */
    initialize() {
        for (const [key, loc] of Object.entries(this.locations)) {
            if (loc.blip) { // blip: null — локация только с маркером
                mp.blips.new(loc.blip.sprite, loc.pos, { name: loc.blip.name, color: loc.blip.color, scale: loc.blip.scale, shortRange: true })
            }
            mp.markers.new(loc.marker.type, new mp.Vector3(loc.pos.x, loc.pos.y, loc.pos.z + loc.marker.zOffset), loc.marker.size, {
                color: loc.marker.color
            });
        }
        logger.info(`[LocationService] Создано локаций на карте: ${Object.keys(this.locations).length}`);
    }

    /**
     * Координаты локации для отправки клиенту
     * @param {string} key - dealership | garage | lsc
     * @returns {Object|null} { x, y, z, h? }
     */
    getPosition(key) {
        const loc = this.locations[key];
        return loc ? loc.pos : null;
    }

    /**
     * Проверка дистанции игрока до локации
     * @param {string} key - Ключ локации
     * @param {mp.Vector3} position - Позиция игрока
     * @param {number} [radius=2.5] - Радиус
     * @returns {boolean}
     */
    isNear(key, position, radius = 2.5) {
        const loc = this.getPosition(key);
        if (!loc || !position) return false;
        return isNear(position, loc, radius)
    }
}

module.exports = new LocationService();