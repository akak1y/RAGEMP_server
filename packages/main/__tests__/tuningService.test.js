const tuningService = require('../services/TuningService');
const { getVehicleModel } = require('../models/Vehicle');
const vehicleService = require('../services/VehicleService');
const moneyService = require('../services/MoneyService');

jest.mock('../models/Vehicle', () => ({ getVehicleModel: jest.fn() }));
jest.mock('../services/VehicleService', () => ({ getVehicleForOwner: jest.fn() }));
jest.mock('../services/MoneyService', () => ({ takeMoney: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    CarCustomPos: { x: 0, y: 0, z: 0, h: 0 },
    TuningConfig: {
        colorPrice: 1000,
        colors: [
            { name: 'Черный', value: { r: 0, g: 0, b: 0 } },
            { name: 'Белый', value: { r: 255, g: 255, b: 255 } }
        ],
        performanceMods: {
            engine: { title: 'Двигатель', modType: 11, topLevel: 3, price: 15000, currentField: 'engine_mod' },
            turbo: { title: 'Турбо', modType: 18, topLevel: 0, price: 25000, currentField: 'turbo_mod' }
        },
        wheels: {
            title: 'Диски',
            options: [
                { name: 'Сток', wheelType: 0, wheelId: -1, price: 100 },
                { name: 'Спортивные', wheelType: 0, wheelId: 5, price: 1000 }
            ]
        }
    }
}));

global.mp = {
    vehicles: { exists: jest.fn(() => true) },
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z
        }
    }
};

const baseCar = () => ({
    id: 7, color_r: 0, color_g: 0, color_b: 0, engine_mod: -1, turbo_mod: -1, wheel_type: 0, wheel_mod: -1
});

describe('TuningService', () => {
    let mockModel, player, veh;
    beforeEach(() => {
        jest.clearAllMocks();
        mockModel = { update: jest.fn().mockResolvedValue([1]) };
        getVehicleModel.mockReturnValue(mockModel);
        vehicleService.getVehicleForOwner.mockResolvedValue(baseCar());
        moneyService.takeMoney.mockResolvedValue(true);
        player = { accountId: 4, accountName: 'akak', id: 4, dimension: 0 };
        veh = { vehicleDbId: 7, setVariable: jest.fn(), dimension: 0 };
    });

    describe('getPrice', () => {
        test('цвет — фикс-цена', () => expect(tuningService.getPrice('color')).toBe(1000));
        test('техмод — цена каталога', () => expect(tuningService.getPrice('engine')).toBe(15000));
        test('диски — цена комплекта', () => expect(tuningService.getPrice('wheels', { wheelType: 0, wheelId: 5 })).toBe(1000));
        test('неизвестное — 0', () => {
            expect(tuningService.getPrice('wheels', { wheelType: 9, wheelId: 9 })).toBe(0);
            expect(tuningService.getPrice('nope')).toBe(0);
        });
    });

    describe('isInstalled', () => {
        test('цвет по RGB', () => {
            expect(tuningService.isInstalled(baseCar(), 'color', { r: 0, g: 0, b: 0 })).toBe(true);
            expect(tuningService.isInstalled(baseCar(), 'color', { r: 1, g: 2, b: 3 })).toBe(false);
        });
        test('техмод по topLevel', () => {
            const car = baseCar(); car.engine_mod = 3;
            expect(tuningService.isInstalled(car, 'engine')).toBe(true);
            expect(tuningService.isInstalled(baseCar(), 'engine')).toBe(false);
        });
        test('диски по паре', () => {
            expect(tuningService.isInstalled(baseCar(), 'wheels', { wheelType: 0, wheelId: -1 })).toBe(true);
        });
    });

    describe('buyUpgrade', () => {
        test('не владелец — отказ', async () => {
            vehicleService.getVehicleForOwner.mockResolvedValue(null);
            expect((await tuningService.buyUpgrade(player, veh, 'engine')).error).toBe('not_owner');
        });
        test('левый цвет и категория — invalid', async () => {
            expect((await tuningService.buyUpgrade(player, veh, 'color', { r: 9, g: 9, b: 9 })).error).toBe('invalid_option');
            expect((await tuningService.buyUpgrade(player, veh, 'nope')).error).toBe('invalid_category');
        });
        test('уже установлено — деньги не трогаем', async () => {
            const r = await tuningService.buyUpgrade(player, veh, 'color', { r: 0, g: 0, b: 0 });
            expect(r.error).toBe('already_installed');
            expect(moneyService.takeMoney).not.toHaveBeenCalled();
        });
        test('недостаточно денег', async () => {
            moneyService.takeMoney.mockResolvedValue(false);
            expect((await tuningService.buyUpgrade(player, veh, 'engine')).error).toBe('not_enough_money');
        });
        test('успех engine: серверная цена игнорирует читерскую', async () => {
            const r = await tuningService.buyUpgrade(player, veh, 'engine', {}, 1);
            expect(r).toEqual({ success: true, error: null, realPrice: 15000 });
            expect(moneyService.takeMoney).toHaveBeenCalledWith(4, 15000, 'тюнинг: engine', null);
            expect(mockModel.update).toHaveBeenCalledWith({ engine_mod: 3 }, { where: { id: 7 }, transaction: null });
            expect(veh.setVariable).toHaveBeenCalledWith('customMod_11', 3);
        });
        test('успех wheels: пара полей + customWheels', async () => {
            const r = await tuningService.buyUpgrade(player, veh, 'wheels', { wheelType: 0, wheelId: 5 });
            expect(r.success).toBe(true);
            expect(mockModel.update).toHaveBeenCalledWith({ wheel_type: 0, wheel_mod: 5 }, { where: { id: 7 }, transaction: null });
            expect(veh.setVariable).toHaveBeenCalledWith('customWheels', { type: 0, id: 5 });
        });
    });

    describe('enter/exit', () => {
        test('enterTuning без машины — отказ', async () => {
            player.vehicle = null;
            expect((await tuningService.enterTuning(player)).error).toBe('no_vehicle');
        });
        test('exitTuning возвращает машину и dimension', async () => {
            player.vehicle = veh;
            await tuningService.enterTuning(player);
            expect(player.dimension).toBe(4);
            tuningService.exitTuning(player);
            expect(player.dimension).toBe(0);
            expect(veh.dimension).toBe(0);
            expect(tuningService.tuningVehicles.has(4)).toBe(false);
        });
    });
});