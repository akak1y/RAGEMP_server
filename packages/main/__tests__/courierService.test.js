const courierService = require('../services/CourierService');
const auditService = require('../services/AuditService');
const logger = require('../core/logger');

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

    test('античит второго заказа: completeOrder сбрасывает deliveryStart', async () => {
        const st = {
            stage: 'return',
            pointIdx: 0,
            vehicleId: 42,
            pay: 200,
            deliveryStart: Date.now() - 600000,
        };
        courierService.states.set(1, st);
        player.position = { x: 10, y: 10, z: 0 };
        await courierService.completeOrder(player, st);
        expect(st.stage).toBe('delivery');
        player.position = { x: 310, y: 410, z: 0 };
        courierService.interact(player);
        expect(auditService.logPlayer).toHaveBeenCalledWith(
            player,
            'courier_cheat',
            expect.objectContaining({ category: 'security', success: false })
        );
        expect(st.stage).toBe('delivery');
    });

    test('endWork: транспорт уничтожен, состояние сброшено', () => {
        courierService.states.set(1, { stage: 'delivery', pointIdx: 0, vehicleId: 42, pay: 200 });
        courierService.endWork(1);
        expect(workVeh.destroy).toHaveBeenCalled();
        expect(courierService.isWorking(1)).toBe(false);
        expect(player.call).toHaveBeenCalledWith('client:courier:target', [null]);
    });

    // ---- дописка: конкурентность выплат и ветки отказа ----

    test('параллельные completeOrder оплачивают заказ один раз (asyncLock)', async () => {
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 200 };
        courierService.states.set(1, st);
        let resolveMoney;
        const p = {
            accountId: 1,
            accountName: 't',
            position: { x: 10, y: 10, z: 0 },
            outputChatBox: () => {},
            call: () => {},
            addMoney: jest.fn(
                () =>
                    new Promise((r) => {
                        resolveMoney = r;
                    })
            ),
        };
        const pr1 = courierService.completeOrder(p, st);
        const pr2 = courierService.completeOrder(p, st);
        await Promise.resolve(); // FIX: дать fn1 стартовать в микротаске и зависнуть на addMoney
        resolveMoney(true);
        await Promise.all([pr1, pr2]);
        expect(p.addMoney).toHaveBeenCalledTimes(1); // fn2 увидел stage!=='return' и вышел
        expect(st.stage).toBe('delivery');
    });

    test('completeOrder: сбой базовой выплаты (false) → return, аудит не пишется', async () => {
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 200 };
        courierService.states.set(1, st);
        const p = {
            accountId: 1,
            accountName: 't',
            position: { x: 10, y: 10, z: 0 },
            outputChatBox: () => {},
            call: () => {},
            addMoney: jest.fn().mockResolvedValue(false),
        };
        await courierService.completeOrder(p, st);
        expect(st.stage).toBe('return');
        expect(auditService.logPlayer).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('провалилось'));
    });

    test('completeOrder: исключение базовой выплаты → return', async () => {
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 200 };
        courierService.states.set(1, st);
        const p = {
            accountId: 1,
            accountName: 't',
            position: { x: 10, y: 10, z: 0 },
            outputChatBox: () => {},
            call: () => {},
            addMoney: jest.fn().mockRejectedValue(new Error('money db down')),
        };
        await courierService.completeOrder(p, st);
        expect(st.stage).toBe('return');
        expect(auditService.logPlayer).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('completeOrder error'));
    });

    test('completeOrder: сбой бонуса после успешной базы → заказ засчитан, аудит НЕ пишется', async () => {
        factionService.getMembership.mockResolvedValue({
            faction: { id: 1, name: 'Семья' },
            member: { rank: 0 },
        });
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 100 };
        courierService.states.set(1, st);
        const p = {
            accountId: 1,
            accountName: 't',
            position: { x: 10, y: 10, z: 0 },
            outputChatBox: jest.fn(),
            call: () => {},
            addMoney: jest.fn((sum, reason) =>
                String(reason).includes('бонус')
                    ? Promise.reject(new Error('bonus down'))
                    : Promise.resolve(true)
            ),
        };
        await courierService.completeOrder(p, st);
        expect(st.stage).toBe('delivery'); // база ушла → перешли к новой посылке
        expect(auditService.logPlayer).not.toHaveBeenCalled(); // успешный аудит потерян осознанно
        expect(p.outputChatBox).toHaveBeenCalledWith(
            expect.stringContaining('часть бонусов не применилась')
        );
    });

    test('completeOrder: сбой казны после бонуса игроку → заказ засчитан, аудит НЕ пишется', async () => {
        factionService.getMembership.mockResolvedValue({
            faction: { id: 1, name: 'Семья' },
            member: { rank: 0 },
        });
        factionService.addTreasury.mockRejectedValue(new Error('treasury down'));
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 100 };
        courierService.states.set(1, st);
        const p = {
            accountId: 1,
            accountName: 't',
            position: { x: 10, y: 10, z: 0 },
            outputChatBox: jest.fn(),
            call: () => {},
            addMoney: jest.fn().mockResolvedValue(true),
        };
        await courierService.completeOrder(p, st);
        expect(p.addMoney).toHaveBeenCalledTimes(2); // база + бонус игроку успели
        expect(st.stage).toBe('delivery');
        expect(auditService.logPlayer).not.toHaveBeenCalled();
    });

    test('completeOrder игнорирует устаревшее (подменённое) состояние', async () => {
        const stOld = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 200 };
        courierService.states.set(1, stOld);
        courierService.states.set(1, { stage: 'return', pointIdx: 1, vehicleId: 99, pay: 1 }); // подмена
        await courierService.completeOrder(player, stOld);
        expect(player.addMoney).not.toHaveBeenCalled();
    });

    test('completeOrder игнорирует состояние не в стадии return', async () => {
        const st = { stage: 'delivery', pointIdx: 0, vehicleId: 42, pay: 200 };
        courierService.states.set(1, st);
        await courierService.completeOrder(player, st);
        expect(player.addMoney).not.toHaveBeenCalled();
        expect(st.stage).toBe('delivery');
    });

    test('interact: рабочий транспорт исчез → работа завершена, цель сброшена', () => {
        courierService.states.set(1, { stage: 'pickup', pointIdx: 0, vehicleId: 42, pay: 200 });
        global.mp.vehicles.at.mockReturnValue(null);
        courierService.interact(player);
        expect(courierService.isWorking(1)).toBe(false);
        expect(player.outputChatBox).toHaveBeenCalledWith(
            expect.stringContaining('Рабочий транспорт потерян')
        );
        expect(player.call).toHaveBeenCalledWith('client:courier:target', [null]);
        global.mp.vehicles.at.mockReturnValue(workVeh); // восстановить дефолт
    });

    test('interact на стартовой точке завершает работу', () => {
        courierService.states.set(1, { stage: 'delivery', pointIdx: 0, vehicleId: 42, pay: 200 });
        player.position = { x: 0, y: 0, z: 0 }; // == startPos
        courierService.interact(player);
        expect(courierService.isWorking(1)).toBe(false);
        expect(player.outputChatBox).toHaveBeenCalledWith(
            expect.stringContaining('Работа завершена'),
            { toast: true } // FIX: endWork зовёт с вторым аргументом
        );
        expect(player.call).toHaveBeenCalledWith('client:courier:target', [null]);
    });

    test('characterization: выход игрока во время await выплаты теряет аудит', async () => {
        const st = { stage: 'return', pointIdx: 0, vehicleId: 42, pay: 200 };
        courierService.states.set(1, st);
        let resolveMoney;
        const p = {
            accountId: 1,
            accountName: 't',
            position: { x: 10, y: 10, z: 0 },
            outputChatBox: () => {},
            call: () => {},
            addMoney: jest.fn(
                () =>
                    new Promise((r) => {
                        resolveMoney = r;
                    })
            ),
        };
        const pr = courierService.completeOrder(p, st);
        await Promise.resolve(); // FIX: fn1 прочитал registered===st (wasRegistered=true) и завис на addMoney
        courierService.endWork(1); // удаляет state ВО ВРЕМЯ await выплаты
        resolveMoney(true);
        await pr;
        expect(auditService.logPlayer).not.toHaveBeenCalled(); // <-- деньги ушли, аудита нет
        expect(st.stage).toBe('processing'); // залипло: stillCurrent()===false
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
