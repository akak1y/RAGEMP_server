const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) { // перехват для работы redis
    if (id.startsWith('node:')) { id = id.replace('node:', '') } // вырезаем 'node:'
    return originalRequire.apply(this, [id]);
};

const { initDB } = require('./db');
const { initRedis, getRedis } = require('./redis');

const accountService = require('./services/AccountService'); // подключён сервис аккаунтов
const locationService = require('./services/LocationService'); // подключён сервис локаций

(async () => {
    try {
        await initDB();
        accountService.initialize(); // инициализируем модель аккаунтов
        
        await initRedis(); // запуск RAM-кэш redis
        console.log('[System] Базы данных и кэш успешно запущены.');

        require('./controllers/playerController');
        require('./controllers/dealershipController');
        require('./controllers/tuningController');
        locationService.initialize();
        console.log('[System] Все системы сервера RAGE MP успешно запущены и готовы!');

        const botService = require('./services/BotService');
        await botService.spawn('Ignat');
        console.log('[System] Бот заспавнен');
        
        const totalCount = await accountService.getTotalCount();
        await getRedis().set('server:stats:total_accounts', totalCount, { EX: 600 }); // сохранение числа и обновление кэша redis каждые 10 мин
        console.log(`[Redis] Обновлен кэш статистики аккаунтов: ${totalCount} шт.`)
    } catch (err) { console.error(`[System ERROR] Ошибка запуска сервера: ${err.message}`) }
})()