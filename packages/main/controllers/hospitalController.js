const healthService = require('../services/HealthService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');

/**
 * Больница: лечение за $100 через healForMoney.
 */
mp.events.add(
    'server:hospital:heal',
    withGuards(
        [isLoggedIn, rateLimit('hospital:heal', 1, 5)],
        async (player) => {
            if (player.health >= 100) {
                return player.call('client:hospital:result', [
                    true,
                    'Вы уже здоровы. Лечение не требуется.',
                ]);
            }

            const result = await healthService.healForMoney(player, 100, 'лечение в больнице');
            if (result.success) {
                player.call('client:hospital:result', [
                    true,
                    `Вы вылечены. Здоровье: ${result.newHealth}. Списано $100.`,
                ]);
            } else {
                player.call('client:hospital:result', [false, result.error]);
            }
        },
        'hospital:heal'
    )
);
