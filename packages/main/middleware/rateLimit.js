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

        try {
            const count = await redis.incr(key);
            if (count === 1) await redis.expire(key, windowSec);

            if (count > maxCalls) {
                logger.warn(`[RateLimit] ${player.accountName} превысил лимит ${action}: ${count}/${maxCalls} за ${windowSec}с`);

                const violKey = `ratelimit:viol:${action}:${id}`;
                const vCount = await redis.incr(violKey);
                if (vCount === 1) {
                    // первое нарушение в окне — создаём строку журнала
                    await redis.expire(violKey, windowSec);
                    const row = await auditService.logPlayer(player, 'ratelimit', {
                        category: 'security',
                        success: false,
                        repeats: 1,
                        details: { action, limit: maxCalls, window: windowSec }
                    });
                    if (row && row.id) await redis.set(`${violKey}:row`, String(row.id), { EX: windowSec });
                } else {
                    // серия продолжается — увеличиваем repeats у той же строки
                    const rowId = await redis.get(`${violKey}:row`);
                    if (rowId) await auditService.bumpRepeats(Number(rowId));
                }
                player.outputChatBox(`!{#FF3333}[Антиспам] Слишком часто. Подождите ${windowSec} секунд.`);
                metrics.inc('rage_ratelimit_blocks_total', 'Rate-limit blocks');
                return false;
            }
            return true;
        } catch (err) { // при падении Redis — пропускаем
            logger.error(`[RateLimit] Ошибка Redis: ${err.message}`);
            return true;
        }
    };
}

module.exports = rateLimit;