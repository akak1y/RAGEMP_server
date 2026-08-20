const locationService = require('../services/LocationService');

jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    DealershipPos: { x: 0, y: 0, z: 0 },
    GaragePos: { x: 10, y: 0, z: 0 },
    CarCustomPos: { x: 20, y: 0, z: 0, h: 90 },
    HospitalPos: { x: 30, y: 0, z: 0 },
    FuelStationPos: { x: 40, y: 0, z: 0 },
    CourierConfig: {
        startPos: { x: 50, y: 0, z: 0 },
    },
    ShopConfig: {
        position: { x: 60, y: 0, z: 0 },
    }
}));

global.mp = {
    blips: { new: jest.fn() },
    markers: { new: jest.fn() },
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    },
};

describe('LocationService', () => {
    beforeEach(() => jest.clearAllMocks());

    test('initialize: 7 локаций, маркер + blip на каждую', () => {
        locationService.initialize();
        expect(global.mp.markers.new).toHaveBeenCalledTimes(7);
        expect(global.mp.blips.new).toHaveBeenCalledTimes(7);
    });

    test('getPosition: координаты или null', () => {
        expect(locationService.getPosition('dealership')).toEqual({ x: 0, y: 0, z: 0 });
        expect(locationService.getPosition('nope')).toBeNull();
    });

    test('isNear: в радиусе true, вне false', () => {
        expect(locationService.isNear('garage', { x: 11, y: 1, z: 0 }, 2.5)).toBe(true);
        expect(locationService.isNear('garage', { x: 100, y: 0, z: 0 }, 2.5)).toBe(false);
        expect(locationService.isNear('nope', { x: 0, y: 0, z: 0 })).toBe(false);
        expect(locationService.isNear('garage', null)).toBe(false);
    });
});
