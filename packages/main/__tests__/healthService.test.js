const healthService = require('../services/HealthService');
const { HospitalPos } = require('../config');

jest.mock('../config', () => ({ HospitalPos: { x: 0, y: 0, z: 0, h: 0 } }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

global.mp = {
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    },
    players: { exists: jest.fn(() => true) },
};

const makePlayer = (overrides = {}) => {
    const player = {
        accountId: 1,
        accountName: 'Test',
        health: 0,
        heading: 1,
        dimension: 1,
        money: 1000,
        spawn: jest.fn(),
        removeAllWeapons: jest.fn(),
        outputChatBox: jest.fn(),
        ...overrides,
    };
    player.takeMoney = jest.fn(async (sum) => {
        if (player.money < sum) return false;
        player.money -= sum;
        return true;
    });
    return player;
};

describe('HealthService', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('setHealth', () => {
        test('кламп сверху до 100', () => {
            const p = makePlayer();
            expect(healthService.setHealth(p, 999)).toBe(100);
        });
        test('кламп снизу до 0', () => {
            const p = makePlayer();
            expect(healthService.setHealth(p, -5)).toBe(0);
        });
        test('валидное значение проходит', () => {
            const p = makePlayer();
            expect(healthService.setHealth(p, 55)).toBe(55);
        });
    });

    describe('heal', () => {
        test('по умолчанию лечит до 100', () => {
            const p = makePlayer({ health: 30 });
            expect(healthService.heal(p)).toBe(100);
            expect(p.health).toBe(100);
        });
        test('можно указать targetHp', () => {
            const p = makePlayer({ health: 30 });
            expect(healthService.heal(p, 75)).toBe(75);
        });
    });

    describe('onPlayerDeath', () => {
        test('респаун в больнице через 5 секунд', () => {
            jest.useFakeTimers();
            const p = makePlayer();
            healthService.onPlayerDeath(p);
            expect(p.outputChatBox).toHaveBeenCalledTimes(1);
            expect(p.spawn).not.toHaveBeenCalled();
            jest.advanceTimersByTime(5000);
            expect(p.spawn).toHaveBeenCalledWith(
                expect.objectContaining({ x: HospitalPos.x, y: HospitalPos.y, z: HospitalPos.z })
            );
            expect(p.health).toBe(100);
            expect(p.removeAllWeapons).toHaveBeenCalled();
            expect(p.heading).toBe(HospitalPos.h);
        });
        test('игрок вышел без сознания — респауна нет', () => {
            jest.useFakeTimers();
            global.mp.players.exists.mockReturnValue(false);
            const p = makePlayer();
            healthService.onPlayerDeath(p);
            jest.advanceTimersByTime(5000);
            expect(p.spawn).not.toHaveBeenCalled();
            global.mp.players.exists.mockReturnValue(true);
        });
        test('onDisconnect отменяет таймер смерти', () => {
            jest.useFakeTimers();
            const p = makePlayer();
            healthService.onPlayerDeath(p);
            healthService.onDisconnect(p.accountId);
            jest.advanceTimersByTime(5000);
            expect(p.spawn).not.toHaveBeenCalled();
        });
        test('двойная смерть очищает предыдущий таймер', () => {
            jest.useFakeTimers();
            const p = makePlayer();
            healthService.onPlayerDeath(p);
            healthService.onPlayerDeath(p);
            expect(healthService._deathTimers.size).toBe(1);
        });
    });

    describe('healForMoney', () => {
        test('успех: списание + лечение до 100', async () => {
            const p = makePlayer({ health: 30, money: 500 });
            const result = await healthService.healForMoney(p, 100);
            expect(result).toEqual({ success: true, newHealth: 100 });
            expect(p.money).toBe(400);
            expect(p.health).toBe(100);
            expect(p.takeMoney).toHaveBeenCalledWith(100, 'лечение');
        });

        test('недостаточно денег: ничего не меняется', async () => {
            const p = makePlayer({ health: 30, money: 50 });
            const result = await healthService.healForMoney(p, 100);
            expect(result).toEqual({ success: false, error: 'not_enough_money' });
            expect(p.health).toBe(30);
            expect(p.money).toBe(50);
        });

        test('некорректная цена: отказ без списания', async () => {
            const p = makePlayer({ health: 30, money: 500 });
            const result = await healthService.healForMoney(p, 0);
            expect(result).toEqual({ success: false, error: 'invalid_price' });
            expect(p.takeMoney).not.toHaveBeenCalled();
        });

        test('кастомная причина передаётся в takeMoney', async () => {
            const p = makePlayer({ health: 30, money: 500 });
            await healthService.healForMoney(p, 100, 'скорая помощь');
            expect(p.takeMoney).toHaveBeenCalledWith(100, 'скорая помощь');
        });
    });
});
