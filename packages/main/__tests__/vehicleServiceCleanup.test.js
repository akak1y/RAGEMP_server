jest.useFakeTimers();

const mockVehicleModel = {
    update: jest.fn(),
    findByPk: jest.fn(),
};

jest.mock('../models/Vehicle', () => ({
    getVehicleModel: jest.fn(() => mockVehicleModel),
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

jest.mock('../config', () => ({
    VehicleConfig: {
        adder: { name: 'Adder', price: 1000000 },
    },
}));

global.mp = {
    joaat: jest.fn((s) => `hash_${s}`),
    vehicles: {
        new: jest.fn(() => ({
            setVariable: jest.fn(),
            getVariable: jest.fn(),
            destroy: jest.fn(),
            position: new mp.Vector3(1, 2, 3),
            prevPos: null,
            vehicleDbId: null,
            getOccupants: jest.fn(() => []),
            engine: true,
            outputChatBox: jest.fn(),
        })),
        exists: jest.fn(() => true),
    },
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    },
};

const vehicleService = require('../services/VehicleService');
const logger = require('../core/logger');

describe('VehicleService: устойчивый cleanup при выходе', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        vehicleService.spawnedVehicles.clear();
        vehicleService.playerOwnedVehicles.clear();
        global.mp.vehicles.exists.mockReturnValue(true);
        mockVehicleModel.update.mockResolvedValue([1]);
    });

    test('despawnVehicle: ошибка destroy не бросает наружу и чистит карты', async () => {
        const veh = {
            getVariable: jest.fn(() => 45),
            destroy: jest.fn(() => {
                throw new Error('destroy failed');
            }),
            position: new mp.Vector3(1, 2, 3),
        };

        vehicleService.spawnedVehicles.set(10, veh);
        vehicleService.playerOwnedVehicles.set(7, new Set([10]));

        await expect(vehicleService.despawnVehicle(10)).resolves.toBeUndefined();

        expect(mockVehicleModel.update).toHaveBeenCalledWith({ fuel: 45 }, { where: { id: 10 } });
        expect(veh.destroy).toHaveBeenCalled();
        expect(vehicleService.spawnedVehicles.has(10)).toBe(false);
        expect(vehicleService.playerOwnedVehicles.has(7)).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('не удалось destroy машины 10')
        );
    });

    test('despawnVehicle: ошибка getVariable не бросает и использует fallback топлива', async () => {
        const veh = {
            getVariable: jest.fn(() => {
                throw new Error('vehicle gone');
            }),
            destroy: jest.fn(),
            position: new mp.Vector3(1, 2, 3),
        };

        vehicleService.spawnedVehicles.set(11, veh);
        vehicleService.playerOwnedVehicles.set(8, new Set([11]));

        await expect(vehicleService.despawnVehicle(11)).resolves.toBeUndefined();

        expect(mockVehicleModel.update).toHaveBeenCalledWith({ fuel: 100 }, { where: { id: 11 } });
        expect(veh.destroy).toHaveBeenCalled();
        expect(vehicleService.spawnedVehicles.has(11)).toBe(false);
        expect(vehicleService.playerOwnedVehicles.has(8)).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('не удалось прочитать топливо машины 11')
        );
    });

    test('despawnVehicle: ошибка сохранения топлива не мешает destroy и cleanup', async () => {
        const veh = {
            getVariable: jest.fn(() => 33),
            destroy: jest.fn(),
            position: new mp.Vector3(1, 2, 3),
        };

        mockVehicleModel.update.mockRejectedValue(new Error('db down'));

        vehicleService.spawnedVehicles.set(12, veh);
        vehicleService.playerOwnedVehicles.set(9, new Set([12]));

        await expect(vehicleService.despawnVehicle(12)).resolves.toBeUndefined();

        expect(veh.destroy).toHaveBeenCalled();
        expect(vehicleService.spawnedVehicles.has(12)).toBe(false);
        expect(vehicleService.playerOwnedVehicles.has(9)).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('despawnVehicle fuel save error')
        );
    });

    test('despawnPlayerVehicles:等待所有 машин и не бросает при ошибке одной', async () => {
        const badVeh = {
            getVariable: jest.fn(() => {
                throw new Error('bad vehicle');
            }),
            destroy: jest.fn(),
            position: new mp.Vector3(1, 2, 3),
        };

        const goodVeh = {
            getVariable: jest.fn(() => 50),
            destroy: jest.fn(),
            position: new mp.Vector3(4, 5, 6),
        };

        vehicleService.spawnedVehicles.set(20, badVeh);
        vehicleService.spawnedVehicles.set(21, goodVeh);
        vehicleService.playerOwnedVehicles.set(5, new Set([20, 21]));

        await expect(vehicleService.despawnPlayerVehicles(5)).resolves.toBeUndefined();

        expect(vehicleService.spawnedVehicles.has(20)).toBe(false);
        expect(vehicleService.spawnedVehicles.has(21)).toBe(false);
        expect(vehicleService.playerOwnedVehicles.has(5)).toBe(false);
        expect(badVeh.destroy).toHaveBeenCalled();
        expect(goodVeh.destroy).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('не удалось прочитать топливо машины 20')
        );
    });
});
