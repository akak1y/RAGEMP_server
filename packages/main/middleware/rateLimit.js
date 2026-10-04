const { getRedis } = require('../core/redis');
const auditService = require('../services/AuditService');
const logger = require('../core/logger');
const metrics = require('../core/metrics');

/**
 * Фабрика middleware для rate-limiting
 *
 * @param {string} action - Имя действия (ключ в Redis)
 * @param {number} maxCalls - Максимум вызовов в окне
 * @param {number} windowSec - Размер окна в секундах (по умолчанию 5)
 * @returns {Function} Guard для withGuards
 */
function rateLimit(action, maxCalls, windowSec = 5) {
    return async function rateLimitGuard(player) {
        if (!player) return false;
        const id = player.accountId || player.ip;
        if (!id) return false;
        const redis = getRedis();
        const key = `ratelimit:${action}:${id}`;

        let count;
        try {
            count = await redis.incr(key);
        } catch (err) {
            logger.error(`[RateLimit] Ошибка Redis (incr): ${err.message}`);
            return true;
        }
        if (count === 1) {
            try {
                await redis.expire(key, windowSec);
            } catch (err) {
                logger.warn(`[RateLimit] Не удалось выставить TTL окна ${action}: ${err.message}`);
            }
        }

        if (count <= maxCalls) return true;

        logger.warn(
            `[RateLimit] ${player.accountName} превысил лимит ${action}: ${count}/${maxCalls} за ${windowSec}с`
        );

        try {
            const violKey = `ratelimit:viol:${action}:${id}`;
            const vCount = await redis.incr(violKey);

            if (vCount === 1) {
                try {
                    await redis.expire(violKey, windowSec);
                } catch (err) {
                    logger.warn(
                        `[RateLimit] Не удалось выставить TTL окна нарушений: ${err.message}`
                    );
                }

                const row = await auditService.logPlayer(player, 'ratelimit', {
                    category: 'security',
                    success: false,
                    repeats: 1,
                    details: { action, limit: maxCalls, window: windowSec },
                });

                if (row && row.id) {
                    try {
                        await redis.set(`${violKey}:row`, String(row.id), { EX: windowSec });
                    } catch (err) {
                        logger.warn(
                            `[RateLimit] Не удалось сохранить id строки нарушений: ${err.message}`
                        );
                    }
                }
            } else {
                const rowId = await redis.get(`${violKey}:row`);
                if (rowId) await auditService.bumpRepeats(Number(rowId));
            }
        } catch (err) {
            logger.error(`[RateLimit] Ошибка учёта нарушений: ${err.message}`);
        }

        try {
            player.outputChatBox(
                `!{#FF3333}[Антиспам] Слишком часто. Подождите ${windowSec} секунд.`,
                { toast: true }
            );
        } catch (err) {
            logger.error(`[RateLimit] Не удалось отправить предупреждение игроку: ${err.message}`);
        }
        metrics.inc('rage_ratelimit_blocks_total', 'Rate-limit blocks');
        return false;
    };
}

module.exports = rateLimit;
