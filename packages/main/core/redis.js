const { createClient } = require('redis');
const logger = require('./logger');

let settings = {};
try {
    settings = require('../settings.json');
} catch {}

let redisClient = null;

function buildRedisUrl() {
    const redisCfg = settings.redis || {};
    const host = process.env.REDIS_HOST || redisCfg.host || '127.0.0.1';
    const port = process.env.REDIS_PORT || redisCfg.port || 6379;
    const db = process.env.REDIS_DB || redisCfg.db || 0;
    const password = process.env.REDIS_PASSWORD || redisCfg.password;
    return password
        ? `redis://:${password}@${host}:${port}/${db}`
        : `redis://${host}:${port}/${db}`;
}

async function initRedis(maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let connectedOnce = false;
        try {
            redisClient = createClient({
                url: buildRedisUrl(),
                socket: {
                    reconnectStrategy: (retries) => {
                        if (!connectedOnce) {
                            return new Error('Redis initial connection failed');
                        }
                        return Math.min((retries + 1) * 100, 5000);
                    },
                },
            });

            redisClient.on('error', (err) => {
                logger.error(`[Redis] ошибка: ${err.message}`);
            });

            redisClient.on('connect', () => {
                connectedOnce = true;
            });

            redisClient.on('reconnecting', () => {
                logger.warn('[Redis] соединение потеряно, выполняю переподключение...');
            });

            redisClient.on('end', () => {
                if (connectedOnce) {
                    logger.warn('[Redis] соединение закрыто');
                }
            });

            await redisClient.connect();
            logger.info('[Redis] Успешно подключено к серверу ОЗУ.');
            return redisClient;
        } catch (err) {
            try {
                if (redisClient) await redisClient.quit().catch(() => {});
            } catch {}
            redisClient = null;

            if (attempt >= maxRetries) {
                throw new Error(`Redis недоступен после ${attempt} попыток: ${err.message}`);
            }

            const delay = Math.pow(2, attempt) * 1000;
            logger.warn(
                `[Redis] Не удалось подключиться (попытка ${attempt}/${maxRetries}): ${err.message}. Повтор через ${delay / 1000}с...`
            );
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

module.exports = {
    initRedis,
    getRedis: () => redisClient,
};
