const healthService = require('../services/HealthService');
const { HospitalConfig } = require('../config');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');

/**
 * Больница: лечение за HospitalConfig.healPrice через healForMoney.
 */
mp.events.add(
    'server:hospital:heal',
    withGuards(
        [isLoggedIn, rateLimit('hospital:heal', 1, 5)],
        async (player) => {
            if (player.health >= 100) {
                return sendEvent(player, 'client:hospital:result', [
                    true,
                    'Вы уже здоровы. Лечение не требуется.',
                ]);
            }
            const price = HospitalConfig.healPrice;
            const result = await healthService.healForMoney(player, price, 'лечение в больнице');
            if (result.success) {
                sendEvent(player, 'client:hospital:result', [
                    true,
                    `Вы вылечены. Здоровье: ${result.newHealth}. Списано $${price}.`,
                ]);
            } else {
                sendEvent(player, 'client:hospital:result', [false, result.error]);
            }
        },
        'hospital:heal'
    )
);
