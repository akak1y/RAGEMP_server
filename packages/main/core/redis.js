const { createClient } = require('redis');

let settings = {};
try {
    settings = require('../settings.json');
} catch {}

let redisClient = null;

function buildRedisUrl() {
    const redisCfg = settings.redis || {};
    const host = process.env.REDIS_HOST || redisCfg.host || 'localhost';
    const port = process.env.REDIS_PORT || redisCfg.port || 6379;
    const db = process.env.REDIS_DB || redisCfg.db || 0;
    const password = process.env.REDIS_PASSWORD || redisCfg.password;
    return password
        ? `redis://:${password}@${host}:${port}/${db}`
        : `redis://${host}:${port}/${db}`;
}

async function initRedis() {
    try {
        redisClient = createClient({ url: buildRedisUrl() });
        redisClient.on('connect', () => console.log('[Redis] Успешно подключено к серверу ОЗУ.'));
        redisClient.on('error', (err) => console.error('[Redis Error]', err));
        await redisClient.connect();
    } catch (err) {
        console.error(`[Redis Error] Не удалось запустить Redis: ${err.message}`);
    }
}

module.exports = {
    initRedis,
    getRedis: () => redisClient,
};
