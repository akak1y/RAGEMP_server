const { getAuditModel, ensureAuditReady } = require('../models/AuditLog');
const { getRedis } = require('../redis');
const logger = require('../logger');

/**
 * AuditService — журнал бизнес-событий
 */
class AuditService {
    constructor() {
        this._listeners = [];
    }

    subscribe(fn) {
        this._listeners.push(fn);
        return () => { this._listeners = this._listeners.filter(f => f !== fn); };
    }

    _emit(row) {
        for (const fn of this._listeners) {
            try { fn(row); } catch {}
        }
    }

    async log(entry) {
        try {
            await ensureAuditReady();
            const { details, ...rest } = entry;
            const row = await getAuditModel().create({
                ...rest,
                details: details === undefined ? null
                    : (typeof details === 'string' ? details : JSON.stringify(details))
            });
            this._emit(row);
            return row;
        } catch (err) {
            logger.error(`[AuditService] Не удалось написать в журнал: ${err.message}`);
            return null;
        }
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

    /**
     * Увеличить счётчик repeats у существующей строки журнала
     * @param {number} rowId - ID строки audit_logs
     */
    async bumpRepeats(rowId) {
        try {
            await ensureAuditReady();
            await getAuditModel().increment('repeats', { where: { id: rowId } });
        } catch (err) { logger.error(`[AuditService] bumpRepeats ошибка: ${err.message}`) }
    }
}

module.exports = new AuditService();