const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) { // перехват для работы redis
    if (id.startsWith('node:')) { id = id.replace('node:', '') } // вырезаем 'node:'
    return originalRequire.apply(this, [id]);
};

const { initDB, syncDB, getSequelize } = require('./core/db');
const { initRedis, getRedis } = require('./core/redis');
const logger = require('./core/logger');

const accountService = require('./services/AccountService'); // сервис аккаунтов
const locationService = require('./services/LocationService'); // сервис локаций

async function refreshStatsCache() { // обновление кэша статистики аккаунтов в Redis
    try {
        const totalCount = await accountService.getTotalCount();
        await getRedis().set('server:stats:total_accounts', totalCount, { EX: 600 });
        logger.info(`[Redis] Обновлен кэш статистики аккаунтов: ${totalCount} шт.`);
    } catch (err) { logger.error(`[Stats] Ошибка обновления кэша: ${err.message}`) }
}

(async () => {
    try {
        await initDB();
        require('./models/Users').getUserModel();
        require('./models/Item').getItemModel();
        require('./models/Vehicle').getVehicleModel();
        require('./models/AuditLog').getAuditModel();
        require('./models/Bot').getBotModel();
        await syncDB();
        accountService.initialize(); // инициализируем модель аккаунтов

        await initRedis(); // запуск RAM-кэш redis
        logger.info('[System] Базы данных и кэш успешно запущены.');

        require('./controllers/moneyApi'); // денежные методы mp.Player
        require('./controllers/commandSystem'); // диспетчер команд
        require('./controllers/authController'); // вход/выход
        require('./controllers/adminCommands'); // админ-команды
        require('./controllers/playerCommands'); // игровые команды
        require('./controllers/gameEvents'); // события игрока
        require('./controllers/vehicleController'); // транспорт
        require('./controllers/locationController'); // раздача координат локаций
        require('./controllers/tuningController'); // тюнинг ТС
        locationService.initialize();
        logger.info('[System] Все системы сервера RAGE MP успешно запущены и готовы!');

        const adminServer = require('./websocket/adminServer');
        adminServer.start();

        const botService = require('./services/BotService');
        await botService.spawn('Ignat');
        logger.info('[System] Бот заспавнен');

        await refreshStatsCache(); // обновляем
        setInterval(refreshStatsCache, 600000) // далее каждые 10 минут
    } catch (err) { logger.error(`[System ERROR] Ошибка запуска сервера: ${err.message}`) }
})();

async function shutdown(signal) { // закрываем MySQL/Redis
    logger.info(`[${signal}] Получен сигнал остановки, закрываем подключения...`);
    try {
        const sequelize = getSequelize();
        if (sequelize) await sequelize.close();
        const redis = getRedis();
        if (redis) await redis.quit();
        logger.info('Все подключения закрыты. Выход.');
        process.exit(0)
    } catch (err) {
        logger.error(`Ошибка при shutdown: ${err.message}`);
        process.exit(1)
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));