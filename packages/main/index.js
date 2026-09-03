const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id.startsWith('node:')) {
        id = id.replace('node:', '');
    }
    return originalRequire.apply(this, [id]);
};

const { initDB, getSequelize } = require('./core/db');
const { initRedis, getRedis } = require('./core/redis');
const logger = require('./core/logger');
const MigrationsRunner = require('./core/migrations');

const accountService = require('./services/AccountService');
const locationService = require('./services/LocationService');

let refreshInterval = null;
let adminServer = null;

async function refreshStatsCache() {
    try {
        const totalCount = await accountService.getTotalCount();
        await getRedis().set('server:stats:total_accounts', totalCount, { EX: 6000 });
        logger.info(`[Redis] Обновлен кэш статистики аккаунтов: ${totalCount} шт.`);
    } catch (err) {
        logger.error(`[Stats] Ошибка обновления кэша: ${err.message}`);
    }
}

(async () => {
    const bootStart = Date.now();

    try {
        const dbsStart = Date.now();
        await Promise.all([initDB(), initRedis()]);
        console.log(`[Boot] БД и кэш: ${Date.now() - dbsStart}ms`);

        const modelsStart = Date.now();
        require('./models/Users').getUserModel();
        require('./models/Item').getItemModel();
        require('./models/Vehicle').getVehicleModel();
        require('./models/AuditLog').getAuditModel();
        require('./models/Bot').getBotModel();
        console.log(`[Boot] Модели: ${Date.now() - modelsStart}ms`);

        const migrateStart = Date.now();
        const sequelize = getSequelize();
        await sequelize.sync({ alter: false });
        await new MigrationsRunner(sequelize).run();
        console.log(`[Boot] Миграции: ${Date.now() - migrateStart}ms`);

        accountService.initialize();

        const ctrlStart = Date.now();
        require('./controllers/moneyApi');
        require('./controllers/commandSystem');
        require('./controllers/authController');
        require('./controllers/adminCommands');
        require('./controllers/playerCommands');
        require('./controllers/gameEvents');
        require('./controllers/vehicleController');
        require('./controllers/locationController');
        require('./controllers/tuningController');
        require('./controllers/shopController');
        require('./controllers/miningController');
        require('./controllers/factionController');
        console.log(`[Boot] Контроллеры: ${Date.now() - ctrlStart}ms`);

        locationService.initialize();

        const factionService = require('./services/FactionService');
        await factionService.ensureSeed();

        adminServer = require('./websocket/adminServer');
        adminServer.start();

        const botService = require('./services/BotService');
        await botService.spawn('Ignat');

        await refreshStatsCache();
        refreshInterval = setInterval(refreshStatsCache, 600000);

        logger.info(`[System] Все системы запущены за ${Date.now() - bootStart}ms`);
    } catch (err) {
        logger.error(`[System ERROR] Ошибка запуска сервера: ${err.message}`);
        process.exit(1);
    }
})();

async function shutdown(signal) {
    logger.info(`[${signal}] Получен сигнал остановки, закрываем подключения...`);

    if (refreshInterval) {
        clearInterval(refreshInterval);
        logger.info('[System] Периодическое обновление статистики остановлено');
    }

    try {
        if (adminServer) {
            await adminServer.stop();
        }

        const redis = getRedis();
        if (redis) {
            await redis.quit();
            logger.info('[Redis] Соединение закрыто');
        }

        const sequelize = getSequelize();
        if (sequelize) {
            await sequelize.close();
            logger.info('[MySQL] Пул соединений закрыт');
        }

        logger.info('Все подключения закрыты. Выход.');
        process.exit(0);
    } catch (err) {
        logger.error(`Ошибка при shutdown: ${err.message}`);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
    logger.error(`[uncaughtException] ${err.stack || err.message}`);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error(`[unhandledRejection] ${reason}`);
});
