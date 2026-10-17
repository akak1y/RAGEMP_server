'use strict';

const { getAuditModel, ensureAuditReady } = require('../models/AuditLog');
const { getRedis } = require('../core/redis');
const logger = require('../core/logger');
const metrics = require('../core/metrics');

/**
 * Настройки батчинга журнала.
 */
const BATCH_LIMIT = 50;
const FLUSH_INTERVAL_MS = 2000;
const MAX_QUEUE = 1000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 50;

const NON_RETRYABLE = new Set([
    'SequelizeValidationError',
    'SequelizeUniqueConstraintError',
    'SequelizeForeignKeyConstraintError',
]);

/**
 * @typedef {Object} QueuedEntry
 * @property {Object} payload - уже сериализованный объект для модели
 * @property {(row: Object|null) => void} resolve - резолв промиса log(); null = дроп
 */

/**
 * AuditService — журнал бизнес-событий с in-memory очередью.
 */
class AuditService {
    constructor() {
        /** @type {Array<(row: Object) => void>} */
        this._listeners = [];
        /** @type {QueuedEntry[]} */
        this._queue = [];
        /** @type {NodeJS.Timeout|null} */
        this._timer = null;
        /** @type {Promise<void>|null} — одноразовый mutex на flush, чтобы не гонять параллельно */
        this._flushing = null;
    }

    /**
     * Подписаться на новые строки журнала (live-вещание в админку).
     * @param {(row: Object) => void} fn
     * @returns {() => void} отписка
     */
    subscribe(fn) {
        this._listeners.push(fn);
        return () => {
            this._listeners = this._listeners.filter((f) => f !== fn);
        };
    }

    /**
     * Оповестить подписчиков. Ошибка одного не роняет остальных.
     * @private
     * @param {Object} row
     */
    _emit(row) {
        for (const fn of this._listeners) {
            try {
                fn(row);
            } catch (err) {
                logger.error(`[AuditService] Ошибка подписчика: ${err.message}`);
            }
        }
    }

    /**
     * Собрать payload для модели из entry: details сериализуется в строку/JSON.
     * @private
     * @param {Object} entry
     * @returns {Object}
     */
    _serializeEntry(entry) {
        const { details, ...rest } = entry;
        return {
            ...rest,
            details:
                details === undefined
                    ? null
                    : typeof details === 'string'
                    ? details
                    : JSON.stringify(details),
        };
    }

    /**
     * Записать событие в журнал.
     * @param {Object} entry
     * @returns {Promise<Object|null>} row после сброса в БД, или null при дропе
     */
    log(entry) {
        if (this._queue.length >= MAX_QUEUE) {
            metrics.inc('rage_audit_dropped_total', 'Audit entries dropped (queue overflow)');
            logger.warn('[AuditService] Очередь переполнена, событие сброшено (overflow)');
            return Promise.resolve(null);
        }

        const payload = this._serializeEntry(entry);
        return new Promise((resolve) => {
            this._queue.push({ payload, resolve });
            if (this._queue.length >= BATCH_LIMIT) {
                this._flushNow();
            } else {
                this._ensureTimer();
            }
        });
    }

    /**
     * Запустить лаг-таймер, если он не активен.
     * @private
     */
    _ensureTimer() {
        if (this._timer) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            this._flushNow();
        }, FLUSH_INTERVAL_MS);
        if (this._timer.unref) this._timer.unref();
    }

    /**
     * Остановить лаг-таймер, если очередь опустела.
     * @private
     */
    _stopTimerIfIdle() {
        if (this._timer && this._queue.length === 0) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }

    /**
     * Немедленный сброс очереди (по лимиту/таймеру/dispose).
     * @private
     * @returns {Promise<void>}
     */
    _flushNow() {
        if (this._flushing) return this._flushing;
        this._flushing = this._drain().finally(() => {
            this._flushing = null;
        });
        return this._flushing;
    }

    /**
     * Публичный сброс: слить всю очередь в БД.
     * @returns {Promise<void>}
     */
    async flush() {
        await this._flushNow();
    }

    /**
     * Ядро сброса: режет очередь на батчи и пишет построчно с retry.
     * @private
     * @returns {Promise<void>}
     */
    async _drain() {
        while (this._queue.length > 0) {
            const batch = this._queue.splice(0, BATCH_LIMIT);
            try {
                await ensureAuditReady();
            } catch (err) {
                logger.error(`[AuditService] flush aborted, срез сброшен: ${err.message}`);
                metrics.inc(
                    'rage_audit_dropped_total',
                    'Audit entries dropped (model not ready)'
                );
                for (const item of batch) item.resolve(null);
                this._stopTimerIfIdle();
                return;
            }

            for (const item of batch) {
                const row = await this._writeOneWithRetry(item.payload);
                if (row) {
                    this._emit(row);
                    item.resolve(row);
                } else {
                    item.resolve(null);
                }
            }
            this._stopTimerIfIdle();
        }
    }

    /**
     * Записать одну строку с retry на транзитные ошибки.
     * @private
     * @param {Object} payload
     * @returns {Promise<Object|null>} row или null
     */
    async _writeOneWithRetry(payload) {
        let attempt = 0;
        while (true) {
            try {
                return await getAuditModel().create(payload);
            } catch (err) {
                const nonRetryable = NON_RETRYABLE.has(err && err.name);
                if (nonRetryable || attempt >= MAX_RETRIES) {
                    metrics.inc('rage_audit_dropped_total', 'Audit entries dropped (write failed)');
                    logger.error(
                        `[AuditService] Не удалось записать событие (attempt ${attempt + 1}): ${
                            err && err.message ? err.message : String(err)
                        }`
                    );
                    return null;
                }
                attempt += 1;
                await this._sleep(RETRY_BASE_MS * attempt);
            }
        }
    }

    /**
     * @private
     * @param {number} ms
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise((r) => {
            const t = setTimeout(r, ms);
            if (t.unref) t.unref();
        });
    }

    /**
     * Записать событие от имени игрока.
     * @param {Object} player
     * @param {string} action
     * @param {Object} [options]
     * @param {boolean} [options.withPosition=false]
     * @returns {Promise<Object|null>}
     */
    logPlayer(player, action, options = {}) {
        const { withPosition = false, ...extra } = options;
        const entry = {
            action,
            actor: player.accountName,
            actor_id: player.accountId,
            ip: player.ip,
            ...extra,
        };
        if (withPosition) {
            const p = player.position || {};
            entry.details = {
                position: `${(p.x || 0).toFixed(1)},${(p.y || 0).toFixed(1)},${(
                    p.z || 0
                ).toFixed(1)}`,
                ...(extra.details || {}),
            };
        }
        return this.log(entry);
    }

    /**
     * Коалесценция серийных провалов.
     * @param {Object} player
     * @param {string} action
     * @param {Object} [options]
     * @returns {Promise<void>}
     */
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
                    ...extra,
                });
                await redis.del(key);
            }
        } catch (err) {
            logger.error(`[AuditService] trackFail ошибка: ${err.message}`);
        }
    }

    /**
     * Последние записи. Сливает очередь перед чтением.
     * @param {number} [limit=10]
     * @param {string|null} [category=null]
     * @returns {Promise<Array>}
     */
    async getRecent(limit = 10, category = null) {
        await this.flush();
        return getAuditModel().findAll({
            where: category ? { category } : {},
            order: [['created_at', 'DESC']],
            limit,
            raw: true,
        });
    }

    /**
     * Увеличить repeats у существующей строки
     * @param {number} rowId
     * @returns {Promise<void>}
     */
    async bumpRepeats(rowId) {
        await this.flush();
        try {
            await getAuditModel().increment('repeats', { where: { id: rowId } });
        } catch (err) {
            logger.error(`[AuditService] bumpRepeats ошибка: ${err.message}`);
        }
    }

    /**
     * Страница журнала + общее число записей
     * @param {number} [page=1]
     * @param {number} [perPage=50]
     * @param {string|null} [category=null]
     * @returns {Promise<{rows: Array, total: number}>}
     */
    async getAuditPage(page = 1, perPage = 50, category = null) {
        await this.flush();
        const Model = getAuditModel();
        const where = category ? { category } : {};
        const total = await Model.count({ where });
        const rows = await Model.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: perPage,
            offset: (page - 1) * perPage,
            raw: true,
        });
        return { rows, total };
    }

    /**
     * Финальный сброс + очистка таймера.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        await this._flushNow();
    }
}

module.exports = new AuditService();
