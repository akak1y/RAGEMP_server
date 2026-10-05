jest.mock('../services/AccountService', () => ({
    getTotalCount: jest.fn(),
}));

jest.mock('../services/CourierService', () => ({
    interact: jest.fn(),
    endWork: jest.fn(),
}));

jest.mock('../services/HealthService', () => ({
    onPlayerDeath: jest.fn(),
    onDisconnect: jest.fn(),
}));

jest.mock('../services/ArmoryService', () => ({
    returnAll: jest.fn().mockResolvedValue(0),
}));

jest.mock('../services/WeaponService', () => ({
    holster: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../services/TuningService', () => ({
    exitTuning: jest.fn(),
    cleanupOnQuit: jest.fn(),
}));

jest.mock('../core/redis', () => ({
    getRedis: jest.fn(),
}));

jest.mock('../middleware/isLoggedIn', () => jest.fn(() => true));

jest.mock('../middleware/withGuards', () => (guards, handler) => handler);

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

jest.mock('../core/eventSender', () => ({
    sendEvent: jest.fn(),
}));

const handlers = new Map();

global.mp = {
    events: {
        add: (name, fn) => handlers.set(name, fn),
    },
    players: {
        exists: jest.fn(() => true),
    },
};

require('../controllers/gameEvents');

const weaponService = require('../services/WeaponService');
const armoryService = require('../services/ArmoryService');
const tuningService = require('../services/TuningService');
const healthService = require('../services/HealthService');
const logger = require('../core/logger');

describe('gameEvents: cleanup LSC при смерти', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        weaponService.holster.mockResolvedValue({ success: true });
        armoryService.returnAll.mockResolvedValue(0);
        tuningService.exitTuning.mockImplementation(() => {});
        healthService.onPlayerDeath.mockImplementation(() => {});
    });

    test('playerDeath вызывает выход из LSC до респауна в больнице', async () => {
        const player = {
            isLoggedIn: true,
            accountId: 1,
            accountName: 'tester',
            health: 0,
        };

        const playerDeath = handlers.get('playerDeath');
        expect(typeof playerDeath).toBe('function');

        await playerDeath(player);

        expect(weaponService.holster).toHaveBeenCalledWith(player);
        expect(armoryService.returnAll).toHaveBeenCalledWith(player, 'death');
        expect(tuningService.exitTuning).toHaveBeenCalledWith(player);
        expect(healthService.onPlayerDeath).toHaveBeenCalledWith(player);

        expect(tuningService.exitTuning.mock.invocationCallOrder[0]).toBeLessThan(
            healthService.onPlayerDeath.mock.invocationCallOrder[0]
        );
    });

    test('исключение в exitTuning не мешает респауну', async () => {
        const player = {
            isLoggedIn: true,
            accountId: 2,
            accountName: 'tester2',
            health: 0,
        };

        tuningService.exitTuning.mockImplementation(() => {
            throw new Error('tuning cleanup boom');
        });

        const playerDeath = handlers.get('playerDeath');

        await expect(playerDeath(player)).resolves.toBeUndefined();

        expect(tuningService.exitTuning).toHaveBeenCalledWith(player);
        expect(healthService.onPlayerDeath).toHaveBeenCalledWith(player);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('[Tuning] ошибка выхода из LSC на смерти tester2')
        );
    });

    test('неавторизованный игрок не проходит cleanup смерти', async () => {
        const player = {
            isLoggedIn: false,
            accountId: null,
            accountName: null,
        };

        const playerDeath = handlers.get('playerDeath');

        await playerDeath(player);

        expect(weaponService.holster).not.toHaveBeenCalled();
        expect(armoryService.returnAll).not.toHaveBeenCalled();
        expect(tuningService.exitTuning).not.toHaveBeenCalled();
        expect(healthService.onPlayerDeath).not.toHaveBeenCalled();
    });
});
