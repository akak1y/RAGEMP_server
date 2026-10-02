const eventHandlers = {};

global.mp = {
    events: {
        add: jest.fn((name, fn) => {
            eventHandlers[name] = fn;
        }),
    },
};

jest.mock('../services/AccountService', () => ({
    getTotalCount: jest.fn(),
}));

jest.mock('../services/CourierService', () => ({
    interact: jest.fn(),
}));

jest.mock('../services/HealthService', () => ({
    onPlayerDeath: jest.fn(),
}));

jest.mock('../services/ArmoryService', () => ({
    returnAll: jest.fn(),
}));

jest.mock('../services/WeaponService', () => ({
    holster: jest.fn(),
}));

jest.mock('../core/redis', () => ({
    getRedis: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
    })),
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

jest.mock('../core/eventSender', () => ({
    sendEvent: jest.fn(),
}));

jest.mock('../middleware/isLoggedIn', () => (player) => !!(player && player.isLoggedIn));

jest.mock('../middleware/withGuards', () => (guards, handler) => handler);

const weaponService = require('../services/WeaponService');
const armoryService = require('../services/ArmoryService');
const healthService = require('../services/HealthService');
const logger = require('../core/logger');

require('../controllers/gameEvents');

describe('gameEvents.playerDeath', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        weaponService.holster.mockResolvedValue({ success: true });
        armoryService.returnAll.mockResolvedValue(0);
    });

    test('сначала убирает оружие в инвентарь, затем возвращает арсенал и только потом вызывает респаун', async () => {
        const player = {
            isLoggedIn: true,
            accountId: 1,
            accountName: 'tester',
        };

        await eventHandlers.playerDeath(player, {}, {});

        expect(weaponService.holster).toHaveBeenCalledTimes(1);
        expect(weaponService.holster).toHaveBeenCalledWith(player);

        expect(armoryService.returnAll).toHaveBeenCalledTimes(1);
        expect(armoryService.returnAll).toHaveBeenCalledWith(player, 'death');

        expect(healthService.onPlayerDeath).toHaveBeenCalledTimes(1);
        expect(healthService.onPlayerDeath).toHaveBeenCalledWith(player);

        expect(weaponService.holster.mock.invocationCallOrder[0]).toBeLessThan(
            armoryService.returnAll.mock.invocationCallOrder[0]
        );
        expect(armoryService.returnAll.mock.invocationCallOrder[0]).toBeLessThan(
            healthService.onPlayerDeath.mock.invocationCallOrder[0]
        );
    });

    test('неавторизованный игрок — no-op', async () => {
        const player = { isLoggedIn: false };

        await eventHandlers.playerDeath(player, {}, {});

        expect(weaponService.holster).not.toHaveBeenCalled();
        expect(armoryService.returnAll).not.toHaveBeenCalled();
        expect(healthService.onPlayerDeath).not.toHaveBeenCalled();
    });

    test('ошибка holster не блокирует возврат арсенала и респаун', async () => {
        const player = {
            isLoggedIn: true,
            accountId: 2,
            accountName: 'tester2',
        };

        weaponService.holster.mockRejectedValueOnce(new Error('holster boom'));

        await eventHandlers.playerDeath(player, {}, {});

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('[Weapon] holster на смерти tester2: holster boom')
        );
        expect(armoryService.returnAll).toHaveBeenCalledWith(player, 'death');
        expect(healthService.onPlayerDeath).toHaveBeenCalledWith(player);
    });

    test('ошибка returnAll не блокирует респаун', async () => {
        const player = {
            isLoggedIn: true,
            accountId: 3,
            accountName: 'tester3',
        };

        armoryService.returnAll.mockRejectedValueOnce(new Error('armory boom'));

        await eventHandlers.playerDeath(player, {}, {});

        expect(weaponService.holster).toHaveBeenCalledWith(player);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('[Armory] ошибка авто-возврата займов на смерти: armory boom')
        );
        expect(healthService.onPlayerDeath).toHaveBeenCalledWith(player);
    });
});
