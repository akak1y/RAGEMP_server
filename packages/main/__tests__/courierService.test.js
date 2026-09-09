const courierService = require('../services/CourierService');
const auditService = require('../services/AuditService');

jest.mock('../services/AuditService', () => ({ logPlayer: jest.fn() }));
jest.mock('../services/FactionService', () => ({
    getMembership: jest.fn(),
    addTreasury: jest.fn(),
}));
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
    FactionConfig: {
        courierBonusPlayer: 0.2,
        courierBonusTreasury: 0.05,
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
    const factionService = require('../services/FactionService');

    beforeEach(() => {
        jest.clearAllMocks();
        courierService.states.clear();
        player.vehicle = null;
        player.position = { x: 0, y: 0, z: 0 };
        player.money = 0;
        factionService.getMembership.mockResolvedValue(null);
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

describe('Бонусы семьи в работе курьера', () => {
    const factionService = require('../services/FactionService');
    let testPlayer;

    beforeEach(() => {
        jest.clearAllMocks();
        testPlayer = {
            accountId: 1,
            accountName: 'test',
            addMoney: jest.fn().mockResolvedValue(true),
            outputChatBox: jest.fn(),
            call: jest.fn(),
        };
    });

    test('курьер без семьи — только базовая зарплата', async () => {
        factionService.getMembership.mockResolvedValue(null);
        const st = { stage: 'return', pointIdx: 0, vehicleId: 1, pay: 100 };

        await courierService.completeOrder(testPlayer, st);

        expect(testPlayer.addMoney).toHaveBeenCalledTimes(1);
        expect(testPlayer.addMoney).toHaveBeenCalledWith(100, 'курьерская доставка');
        expect(factionService.addTreasury).not.toHaveBeenCalled();
    });

    test('курьер в семье — базовая + бонус игроку + казна', async () => {
        factionService.getMembership.mockResolvedValue({
            faction: { id: 1, name: 'Семья Корлеоне' },
            member: { rank: 0 },
        });
        factionService.addTreasury.mockResolvedValue(true);
        const st = { stage: 'return', pointIdx: 0, vehicleId: 1, pay: 100 };

        await courierService.completeOrder(testPlayer, st);

        expect(testPlayer.addMoney).toHaveBeenCalledTimes(2);
        expect(testPlayer.addMoney).toHaveBeenCalledWith(100, 'курьерская доставка');
        expect(testPlayer.addMoney).toHaveBeenCalledWith(20, 'бонус семьи Семья Корлеоне');
        expect(factionService.addTreasury).toHaveBeenCalledWith(1, 10);
    });

    test('округление бонусов до 10', async () => {
        factionService.getMembership.mockResolvedValue({
            faction: { id: 1, name: 'Семья' },
            member: { rank: 0 },
        });
        factionService.addTreasury.mockResolvedValue(true);
        const st = { stage: 'return', pointIdx: 0, vehicleId: 1, pay: 33 };

        await courierService.completeOrder(testPlayer, st);

        expect(testPlayer.addMoney).toHaveBeenCalledWith(10, expect.stringContaining('бонус'));
        expect(factionService.addTreasury).not.toHaveBeenCalled();
    });
});
