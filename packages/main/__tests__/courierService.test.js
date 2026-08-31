const courierService = require('../services/CourierService');
const auditService = require('../services/AuditService');

jest.mock('../services/AuditService', () => ({ logPlayer: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    CourierConfig: {
        vehicleModel: 'vindicator',
        payBase: 50,
        payPerMeter: 1.5,
        interactRadius: 3,
        minDeliverySpeed: 30,
        startPos: { x: 0, y: 0, z: 0 },
        warehousePos: { x: 10, y: 10, z: 0 },
        vehicleSpawnPoints: [{ x: 5, y: 5, z: 0, h: 90 }],
        deliveryPoints: [
            { x: 10, y: 110, z: 0 },
            { x: 310, y: 410, z: 0 },
        ],
    },
}));

const workVeh = { id: 42, setVariable: jest.fn(), destroy: jest.fn() };
const player = {
    accountId: 1,
    accountName: 'Test',
    money: 0,
    vehicle: null,
    position: { x: 0, y: 0, z: 0 },
    call: jest.fn(),
    outputChatBox: jest.fn(),
};

player.addMoney = jest.fn(async (sum) => {
    player.money += sum;
    return true;
});
global.mp = {
    joaat: jest.fn((s) => s),
    vehicles: {
        new: jest.fn(() => workVeh),
        at: jest.fn(() => workVeh),
        exists: jest.fn(() => true),
    },
    players: { toArray: jest.fn(() => [player]) },
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    },
};

describe('CourierService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        courierService.states.clear();
        player.vehicle = null;
        player.position = { x: 0, y: 0, z: 0 };
        player.money = 0;
    });

    test('calcPay: база + метры, округление до 10', () => {
        expect(courierService.calcPay(0)).toBe(200);
        expect(courierService.calcPay(1)).toBe(800);
    });

    test('interact в транспорте — отказ', () => {
        player.vehicle = {};
        courierService.interact(player);
        expect(player.outputChatBox).toHaveBeenCalled();
        expect(courierService.isWorking(1)).toBe(false);
    });

    test('старт на метке: транспорт, этап pickup, цель — склад', () => {
        courierService.interact(player);
        expect(global.mp.vehicles.new).toHaveBeenCalledTimes(1);
        expect(workVeh.setVariable).toHaveBeenCalledWith('courierWork', 1);
        expect(courierService.states.get(1).stage).toBe('pickup');
        expect(player.call).toHaveBeenCalledWith('client:courier:target', [10, 10, 0, 'pickup']);
    });

    test('взял посылку на складе → delivery', () => {
        courierService.states.set(1, { stage: 'pickup', pointIdx: 0, vehicleId: 42, pay: 200 });
        player.position = { x: 10, y: 10, z: 0 };
        courierService.interact(player);
        expect(courierService.states.get(1).stage).toBe('delivery');
        expect(courierService.states.get(1).deliveryStart).toEqual(expect.any(Number));
    });

    test('античит: слишком быстро — отказ и аудит', () => {
        courierService.states.set(1, {
            stage: 'delivery',
            pointIdx: 0,
            vehicleId: 42,
            pay: 200,
            deliveryStart: Date.now(),
        });
        player.position = { x: 10, y: 110, z: 0 };
        courierService.interact(player);
        expect(auditService.logPlayer).toHaveBeenCalledWith(
            player,
            'courier_cheat',
            expect.objectContaining({ category: 'security', success: false })
        );
        expect(courierService.states.get(1).stage).toBe('delivery');
    });

    test('честная доставка → return', () => {
        courierService.states.set(1, {
            stage: 'delivery',
            pointIdx: 0,
            vehicleId: 42,
            pay: 200,
            deliveryStart: Date.now() - 60000,
        });
        player.position = { x: 10, y: 110, z: 0 };
        courierService.interact(player);
        expect(courierService.states.get(1).stage).toBe('return');
    });

    test('возврат: оплата, аудит, новая точка', async () => {
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 200 };
        player.position = { x: 10, y: 10, z: 0 };
        await courierService.completeOrder(player, st);
        expect(player.addMoney).toHaveBeenCalledWith(200, 'курьерская доставка');
        expect(player.money).toBe(200);
        expect(auditService.logPlayer).toHaveBeenCalledWith(
            player,
            'courier',
            expect.objectContaining({ amount: 200 })
        );
        expect(st.stage).toBe('delivery');
        expect(st.pointIdx).toBe(1);
    });

    test('endWork: транспорт уничтожен, состояние сброшено', () => {
        courierService.states.set(1, { stage: 'delivery', pointIdx: 0, vehicleId: 42, pay: 200 });
        courierService.endWork(1);
        expect(workVeh.destroy).toHaveBeenCalled();
        expect(courierService.isWorking(1)).toBe(false);
        expect(player.call).toHaveBeenCalledWith('client:courier:target', [null]);
    });
});
