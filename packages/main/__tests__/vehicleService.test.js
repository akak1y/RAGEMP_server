jest.useFakeTimers();
jest.setSystemTime(new Date('2026-01-01'));

const vehicleService = require('../services/VehicleService');
const { getVehicleModel } = require('../models/Vehicle');

jest.mock('../models/Vehicle', () => ({ getVehicleModel: jest.fn() }));
jest.mock('../services/MoneyService', () => ({ takeMoney: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    VehicleConfig: {
        adder: { name: 'Adder', price: 1000000 },
        kuruma: { name: 'Kuruma', price: 50000 },
    },
}));

const mockVehicleModel = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn(),
};

global.mp = {
    joaat: jest.fn((s) => `hash_${s}`),
    vehicles: {
        new: jest.fn(() => ({
            setVariable: jest.fn(),
            position: new mp.Vector3(1, 2, 3),
            prevPos: null,
            vehicleDbId: null,
            destroy: jest.fn(),
            getVariable: jest.fn(),
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

describe('VehicleService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getVehicleModel.mockReturnValue(mockVehicleModel);
        vehicleService.spawnedVehicles.clear();
        vehicleService.playerOwnedVehicles.clear();
        global.mp.vehicles.exists.mockReturnValue(true);
    });

    describe('buyVehicle', () => {
        test('успех с транзакцией', async () => {
            const tx = {};
            const r = await vehicleService.buyVehicle(5, 'adder', tx);
            expect(r).toEqual({ success: true, error: null });
            expect(mockVehicleModel.create).toHaveBeenCalledWith(
                { owner_id: 5, model: 'adder', fuel: 100 },
                { transaction: tx }
            );
        });
        test('неизвестная модель — отказ', async () => {
            const r = await vehicleService.buyVehicle(5, 'nope');
            expect(r.error).toBe('unknown_model');
            expect(mockVehicleModel.create).not.toHaveBeenCalled();
        });
    });

    describe('getPlayerVehicles', () => {
        test('findAll с owner_id', async () => {
            mockVehicleModel.findAll.mockResolvedValue([{ id: 1 }]);
            const r = await vehicleService.getPlayerVehicles(7);
            expect(mockVehicleModel.findAll).toHaveBeenCalledWith({ where: { owner_id: 7 } });
            expect(r).toEqual([{ id: 1 }]);
        });
    });

    describe('getVehicleForOwner', () => {
        test('findOne с двумя условиями', async () => {
            mockVehicleModel.findOne.mockResolvedValue({ id: 3 });
            const r = await vehicleService.getVehicleForOwner(3, 7);
            expect(mockVehicleModel.findOne).toHaveBeenCalledWith({
                where: { id: 3, owner_id: 7 },
            });
            expect(r).toEqual({ id: 3 });
        });
    });

    describe('isSpawned', () => {
        test('true если в карте и exists', () => {
            const veh = {};
            vehicleService.spawnedVehicles.set(1, veh);
            expect(vehicleService.isSpawned(1)).toBe(true);
        });
        test('false если not exists', () => {
            const veh = {};
            vehicleService.spawnedVehicles.set(1, veh);
            global.mp.vehicles.exists.mockReturnValue(false);
            expect(vehicleService.isSpawned(1)).toBe(false);
        });
        test('false если нет в карте', () => {
            expect(vehicleService.isSpawned(99)).toBe(false);
        });
    });

    describe('spawnVehicle', () => {
        test('создание + setVariable + trackOwner', () => {
            const carData = {
                id: 10,
                owner_id: 7,
                model: 'adder',
                fuel: 80,
                color_r: 255,
                color_g: 0,
                color_b: 0,
                engine_mod: 3,
                brakes_mod: -1,
                transmission_mod: -1,
                turbo_mod: -1,
                wheel_type: 0,
                wheel_mod: 5,
            };
            const coords = new mp.Vector3(1, 2, 3);
            const veh = vehicleService.spawnVehicle(carData, coords, 90, 0);

            expect(global.mp.vehicles.new).toHaveBeenCalledWith(
                'hash_adder',
                coords,
                expect.any(Object)
            );
            expect(veh.setVariable).toHaveBeenCalledWith('fuel', 80);
            expect(veh.setVariable).toHaveBeenCalledWith('dbId', 10);
            expect(veh.setVariable).toHaveBeenCalledWith('customColor', { r: 255, g: 0, b: 0 });
            expect(veh.setVariable).toHaveBeenCalledWith('customMod_11', 3);
            expect(veh.setVariable).toHaveBeenCalledWith('customWheels', { type: 0, id: 5 });
            expect(vehicleService.spawnedVehicles.get(10)).toBe(veh);
            expect(vehicleService.playerOwnedVehicles.get(7).has(10)).toBe(true);
        });
    });

    describe('despawnVehicle', () => {
        test('сохранение топлива + destroy + удаление из карт', async () => {
            const veh = {
                setVariable: jest.fn(),
                getVariable: jest.fn(() => 45),
                destroy: jest.fn(),
                position: new mp.Vector3(1, 2, 3),
            };
            vehicleService.spawnedVehicles.set(10, veh);
            vehicleService.playerOwnedVehicles.set(7, new Set([10]));

            await vehicleService.despawnVehicle(10);

            expect(mockVehicleModel.update).toHaveBeenCalledWith(
                { fuel: 45 },
                { where: { id: 10 } }
            );
            expect(veh.destroy).toHaveBeenCalled();
            expect(vehicleService.spawnedVehicles.has(10)).toBe(false);
            expect(vehicleService.playerOwnedVehicles.has(7)).toBe(false);
        });
        test('нет в карте — ничего не делаем', async () => {
            await vehicleService.despawnVehicle(99);
            expect(mockVehicleModel.update).not.toHaveBeenCalled();
        });
    });

    describe('respawnVehicle', () => {
        test('false если not spawned', async () => {
            expect(await vehicleService.respawnVehicle(10)).toBe(false);
        });
        test('false если findByPk вернул null', async () => {
            const veh = {
                setVariable: jest.fn(),
                getVariable: jest.fn(() => 100),
                destroy: jest.fn(),
                position: new mp.Vector3(1, 2, 3),
                heading: 90,
                dimension: 0,
            };
            vehicleService.spawnedVehicles.set(10, veh);
            mockVehicleModel.findByPk.mockResolvedValue(null);

            expect(await vehicleService.respawnVehicle(10)).toBe(false);
        });
        test('успех: despawn + spawn с теми же координатами', async () => {
            const veh = {
                setVariable: jest.fn(),
                getVariable: jest.fn(() => 100),
                destroy: jest.fn(),
                position: new mp.Vector3(1, 2, 3),
                heading: 90,
                dimension: 0,
            };
            vehicleService.spawnedVehicles.set(10, veh);
            vehicleService.playerOwnedVehicles.set(7, new Set([10]));
            mockVehicleModel.findByPk.mockResolvedValue({
                id: 10,
                owner_id: 7,
                model: 'adder',
                fuel: 80,
                color_r: 255,
                color_g: 255,
                color_b: 255,
                engine_mod: -1,
                brakes_mod: -1,
                transmission_mod: -1,
                turbo_mod: -1,
                wheel_type: 0,
                wheel_mod: -1,
            });

            const r = await vehicleService.respawnVehicle(10);
            expect(r).toBe(true);
            expect(veh.destroy).toHaveBeenCalled();
            expect(global.mp.vehicles.new).toHaveBeenCalledTimes(1);
        });
    });

    describe('getConsumptionRate', () => {
        test('формула: 0.01 + 0.003 * max(0, kmh)', () => {
            expect(vehicleService.getConsumptionRate(0)).toBe(0.01);
            expect(vehicleService.getConsumptionRate(100)).toBeCloseTo(0.31);
            expect(vehicleService.getConsumptionRate(-10)).toBe(0.01);
        });
    });

    describe('refuelVehicle', () => {
        test('not_found если нет в БД', async () => {
            mockVehicleModel.findOne.mockResolvedValue(null);
            const r = await vehicleService.refuelVehicle(10, 7);
            expect(r.error).toBe('not_found');
        });
        test('not_spawned если нет в мире', async () => {
            mockVehicleModel.findOne.mockResolvedValue({ id: 10 });
            global.mp.vehicles.exists.mockReturnValue(false);
            const r = await vehicleService.refuelVehicle(10, 7);
            expect(r.error).toBe('not_spawned');
        });
        test('full если топливо >= 100', async () => {
            mockVehicleModel.findOne.mockResolvedValue({ id: 10 });
            const veh = {
                getVariable: jest.fn(() => 100),
                setVariable: jest.fn(),
            };
            vehicleService.spawnedVehicles.set(10, veh);

            const r = await vehicleService.refuelVehicle(10, 7);
            expect(r.error).toBe('full');
        });
        test('успех: setVariable + liters', async () => {
            mockVehicleModel.findOne.mockResolvedValue({ id: 10 });
            const veh = { getVariable: jest.fn(() => 40), setVariable: jest.fn() };
            vehicleService.spawnedVehicles.set(10, veh);

            const r = await vehicleService.refuelVehicle(10, 7);
            expect(r.success).toBe(true);
            expect(r.liters).toBe(60);
            expect(veh.setVariable).toHaveBeenCalledWith('fuel', 100);
        });
    });

    describe('setFuel', () => {
        test('true если машина в мире', () => {
            const veh = { setVariable: jest.fn() };
            vehicleService.spawnedVehicles.set(10, veh);
            expect(vehicleService.setFuel(10, 75)).toBe(true);
            expect(veh.setVariable).toHaveBeenCalledWith('fuel', 75);
        });
        test('false если not exists', () => {
            global.mp.vehicles.exists.mockReturnValue(false);
            const veh = { setVariable: jest.fn() };
            vehicleService.spawnedVehicles.set(10, veh);
            expect(vehicleService.setFuel(10, 75)).toBe(false);
        });
        test('false если нет в карте', () => {
            expect(vehicleService.setFuel(99, 75)).toBe(false);
        });
    });

    describe('tickFuel', () => {
        test('курьерский транспорт пропускается', () => {
            const veh = {
                getVariable: jest.fn((key) => (key === 'courierWork' ? true : 50)),
                setVariable: jest.fn(),
                getOccupants: jest.fn(() => []),
                position: new mp.Vector3(1, 2, 3),
                prevPos: new mp.Vector3(0, 0, 0),
            };
            vehicleService.spawnedVehicles.set(10, veh);

            jest.advanceTimersByTime(1000);
            vehicleService.tickFuel();
            expect(veh.setVariable).not.toHaveBeenCalled();
        });
        test('нет водителя — пропускаем', () => {
            const veh = {
                getVariable: jest.fn(() => 50),
                setVariable: jest.fn(),
                getOccupants: jest.fn(() => []),
                position: new mp.Vector3(1, 2, 3),
                prevPos: new mp.Vector3(0, 0, 0),
            };
            vehicleService.spawnedVehicles.set(10, veh);

            jest.advanceTimersByTime(1000);
            vehicleService.tickFuel();
            expect(veh.setVariable).not.toHaveBeenCalled();
        });
        test('расход + глушение при нуле', () => {
            const driver = { outputChatBox: jest.fn() };
            const veh = {
                getVariable: jest.fn((key) => (key === 'fuel' ? 0.5 : null)),
                setVariable: jest.fn(),
                getOccupants: jest.fn(() => [{ seat: 0, ...driver }]),
                position: new mp.Vector3(100, 0, 0),
                prevPos: new mp.Vector3(0, 0, 0),
                engine: true,
            };
            vehicleService.spawnedVehicles.set(10, veh);

            jest.advanceTimersByTime(1000);
            vehicleService.tickFuel();
            expect(veh.setVariable).toHaveBeenCalledWith('fuel', 0);
            expect(veh.engine).toBe(false);
            expect(driver.outputChatBox).toHaveBeenCalled();
        });
    });
});
