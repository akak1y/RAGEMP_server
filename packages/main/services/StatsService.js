const { fn, col } = require('sequelize');
const { performance } = require('perf_hooks');
const { getRedis } = require('../core/redis');
const { getUserModel } = require('../models/Users');
const logger = require('../core/logger');
const profile = require('../core/profiler');

const ECONOMY_CACHE_KEY = 'server:stats:economy';
const ECONOMY_CACHE_TTL = 60; // как часто экономика перечитывается из MySQL

/**
 * StatsService — витрина SQL-агрегаций и кэширования
 */
class StatsService {
    async getEconomyStats() {
        const redis = getRedis();

        const tRedis = performance.now();
        const cached = await redis.get(ECONOMY_CACHE_KEY);   // реальная операция
        const redisMs = (performance.now() - tRedis).toFixed(2);

        if (cached) {
            return { ...JSON.parse(cached), source: 'redis', ms: redisMs };
        }

        const Users = getUserModel();
        const tSql = performance.now();
        const [row] = await profile('Stats:EconomySQL', () => Users.findAll({
            attributes: [
                [fn('COUNT', col('id')), 'total'],
                [fn('SUM', col('money')), 'totalMoney'],
                [fn('AVG', col('money')), 'avgMoney'],
                [fn('MAX', col('money')), 'maxMoney']
            ],
            raw: true
        }));
        const sqlMs = (performance.now() - tSql).toFixed(2); 

        const stats = {
            total: Number(row.total),
            totalMoney: Number(row.totalMoney || 0),
            avgMoney: Math.round(Number(row.avgMoney || 0)),
            maxMoney: Number(row.maxMoney || 0)
        };

        await redis.set(ECONOMY_CACHE_KEY, JSON.stringify(stats), { EX: ECONOMY_CACHE_TTL });
        logger.info(`[Stats] Экономика перечитана из MySQL и закэширована на ${ECONOMY_CACHE_TTL}с`);

        return { ...stats, source: 'mysql', ms: sqlMs };
    }

    /**
     * Синтетический бенчмарк Redis. НЕ вызывается в hot path
     * @param {number} [iterations=50] - Число итераций
     * @returns {Promise<{iterations: number, avgMs: string}>}
     */
    async benchmarkRedis(iterations = 50) {
        const redis = getRedis();
        const t = performance.now();
        await Promise.all(Array.from({ length: iterations }, () => redis.get(ECONOMY_CACHE_KEY)));
        return { iterations, avgMs: ((performance.now() - t) / iterations).toFixed(2) };
    }

    async getTopPlayers(limit = 3) {
        const Users = getUserModel();
        return Users.findAll({
            attributes: ['username', 'money'],
            order: [['money', 'DESC']],
            limit,
            raw: true
        });
    }

    getOnlineStats() {
        return {
            online: mp.players.length,
            vehicles: mp.vehicles.length
        };
    }

    async invalidateEconomyCache() { await getRedis().del(ECONOMY_CACHE_KEY) }
}

module.exports = new StatsService()