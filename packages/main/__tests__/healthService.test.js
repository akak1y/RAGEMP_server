const healthService = require('../services/HealthService');
const { HospitalPos } = require('../config');

jest.mock('../config', () => ({ HospitalPos: { x: 0, y: 0, z: 0, h: 0 } }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

global.mp = {
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z
        }
    },
    players: { exists: jest.fn(() => true) }
};

const makePlayer = () => ({
    health: 0, heading: 1, dimension: 1,
    spawn: jest.fn(), removeAllWeapons: jest.fn(), outputChatBox: jest.fn()
});

describe('HealthService', () => {
    afterEach(() => jest.useRealTimers());

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

    describe('onPlayerDeath', () => {
        test('респаун в больнице через 5 секунд', () => {
            jest.useFakeTimers();
            const p = makePlayer();
            healthService.onPlayerDeath(p);
            expect(p.outputChatBox).toHaveBeenCalledTimes(1);
            expect(p.spawn).not.toHaveBeenCalled();
            jest.advanceTimersByTime(5000);
            expect(p.spawn).toHaveBeenCalledWith(expect.objectContaining({ x: HospitalPos.x, y: HospitalPos.y, z: HospitalPos.z }));
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
    });
});