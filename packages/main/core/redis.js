const { createClient } = require('redis');
let gConfig = require('../settings.json');
let redisClient = null; // хранилище

async function initRedis() {
    try {
        redisClient = createClient({ // создаём клиент
            url: gConfig.redis.url
        });
        // регистрируем события
        redisClient.on('connect', () => console.log('[Redis] Успешно подключено к серверу ОЗУ.'));
        redisClient.on('error', (err) => console.error('[Redis Error]', err));
        await redisClient.connect()
    } catch (err) { console.error(`[Redis Error] Не удалось запустить Redis: ${err.message}`) }
};

module.exports = {
    initRedis,
    getRedis: () => redisClient 
}