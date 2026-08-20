const accountService = require('../services/AccountService');
const courierService = require('../services/CourierService');
const healthService = require('../services/HealthService');
const { getRedis } = require('../core/redis');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const logger = require('../core/logger');

/**
 * Игровые события игроков.
 */

// СИСТЕМНЫЕ СОБЫТИЯ ============
mp.events.add(
    'server:requestRedisStats',
    withGuards(
        [isLoggedIn],
        async (player) => {
            // мост для обновления счётчиков акк-ов
            const redis = getRedis();
            let cachedTotal = await redis.get('server:stats:total_accounts'); // вытаскиваем данные из ОЗУ
            if (cachedTotal === null) {
                // если в ОЗУ нет данных, вытаскиваем из бд
                const countFromDb = await accountService.getTotalCount();
                logger.warn('[Redis Error] Сработал запрос в БД');
                await redis.set('server:stats:total_accounts', countFromDb, { EX: 3600 });
                cachedTotal = countFromDb;
            }
            player.call('client:setRedisStats', [parseInt(cachedTotal) || 0]); // отправляем цифру на клиент игрока
        },
        'requestRedisStats'
    )
);

mp.events.add('playerDeath', (player, _reason, _killer) => {
    if (!player.isLoggedIn) return;
    healthService.onPlayerDeath(player);
});

// РАБОТА КУРЬЕРОМ ============
mp.events.add(
    'server:courier:interact',
    withGuards(
        [isLoggedIn],
        (player) => {
            courierService.interact(player);
        },
        'courier:interact'
    )
);
