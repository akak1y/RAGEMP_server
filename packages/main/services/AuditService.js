const { getAuditModel, ensureAuditReady } = require('../models/AuditLog');
const { getRedis } = require('../redis');
const logger = require('../logger');

/**
 * AuditService — журнал бизнес-событий
 */
class AuditService {
    async log(entry) {
        try {
            await ensureAuditReady();
            const { details, ...rest } = entry;
            await getAuditModel().create({
                ...rest,
                details: details === undefined ? null
                    : (typeof details === 'string' ? details : JSON.stringify(details))
            });
        } catch (err) { logger.error(`[AuditService] Не удалось написать в журнал: ${err.message}`) }
    }

    logPlayer(player, action, options = {}) {
        const { withPosition = false, ...extra } = options;
        const entry = {
            action,
            actor: player.accountName,
            actor_id: player.accountId,
            ip: player.ip,
            ...extra
        };
        if (withPosition) {
            const p = player.position || {};
            entry.details = {
                position: `${(p.x || 0).toFixed(1)},${(p.y || 0).toFixed(1)},${(p.z || 0).toFixed(1)}`,
                ...(extra.details || {})
            };
        }
        return this.log(entry);
    }

    // коалесценция серийных провалов: threshold. защита БД от флуда
    async trackFail(player, action, options = {}) {
        const { threshold = 20, windowSec = 60, ...extra } = options;
        try {
            const redis = getRedis();
            const key = `audit:fail:${action}:${player.accountId}`;
            const count = await redis.incr(key);
            if (count === 1) await redis.expire(key, windowSec);

            if (count >= threshold) {
                await this.logPlayer(player, action, {
                    category: 'security',
                    success: false,
                    repeats: count,
                    withPosition: true,
                    ...extra
                });
                await redis.del(key);
            }
        } catch (err) { logger.error(`[AuditService] trackFail ошибка: ${err.message}`) }
    }

    async getRecent(limit = 10, category = null) {
        await ensureAuditReady();
        return getAuditModel().findAll({
            where: category ? { category } : {},
            order: [['created_at', 'DESC']],
            limit,
            raw: true
        });
    }
}

module.exports = new AuditService();