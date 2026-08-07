const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) { // перехват для работы redis
    if (id.startsWith('node:')){
        id = id.replace('node:', '') // вырезаем 'node:'
    }
    return originalRequire.apply(this, [id]);
};

const { initDB } = require('./db');
const { initRedis, getRedis } = require('./redis');
const { performance } = require('perf_hooks');

const accountService = require('./services/AccountService'); // подключён сервис аккаунтов
const inventoryService = require('./services/InventoryService'); // подключён сервис инвентаря
const locationService = require('./services/LocationService'); // подключён сервис локаций

(async () => {
    try {
        await initDB();
        accountService.initialize(); // инициализируем модель аккаунтов
        
        await initRedis(); // запуск RAM-кэш redis
        console.log('[System] Базы данных и кэш успешно запущены.');

        require('./player');
        require('./controllers/dealershipController');
        require('./controllers/tuningController');
        locationService.initialize();
        console.log('[System] Все системы сервера RAGE MP успешно запущены и готовы!');
        
        const totalCount = await accountService.getTotalCount();
        await getRedis().set('server:stats:total_accounts', totalCount, { EX: 600 }); // сохранение числа и обновление кэша redis каждые 10 мин
        console.log(`[Redis] Обновлен кэш статистики аккаунтов: ${totalCount} шт.`)
    } catch (err) {
        console.error(`[System ERROR] Ошибка запуска сервера: ${err.message}`);
    }
})();

mp.events.add("playerCommand", async (player, command) => {
    if (!player.isLoggedIn) return; // проверка на авторизацию

    const args = command.split(/[ ]+/);
    const cmdName = args.shift().toLowerCase();

    if (cmdName === "checkban") {
        const targetUsername = args.join(" ").trim();
        if (!targetUsername) return player.outputChatBox("Использование: /checkban [логин]");

        const redis = getRedis();
        const cacheKey = `server:cache:bancheck:${targetUsername.toLowerCase()}`;
        const cachedResult = await redis.get(cacheKey);
        if (cachedResult !== null) {
            const tStartRedis = performance.now();
            const memoryCheck = cachedResult === "clear"; 
            const tEndRedis = performance.now();
            player.outputChatBox(`!{#00FF00}[Redis КЭШ] Игрок ${targetUsername} проверен.`);
            player.outputChatBox(`!{#00FF00} Скорость RAM-ответа: ${(tEndRedis - tStartRedis).toFixed(3)} мс`);
            return
        }
        const tStartMysql = performance.now();
        const userCheck = await accountService.findByUsername(targetUsername);
        const tEndMysql = performance.now();
        if (!userCheck) {
            player.outputChatBox(`!{#FFaa00}[MySQL] Игрок "${targetUsername}" не найден.`);
            return
        }
        await redis.set(cacheKey, "clear", { EX: 60 });
        player.outputChatBox(`!{#FFcc00}[MySQL] Данные считаны через ORM.`);
        player.outputChatBox(`!{#FFcc00} Скорость ORM-ответа: ${(tEndMysql - tStartMysql).toFixed(3)} мс`)
    }

    if (cmdName === "givemoney") {
        const amount = parseInt(args);
        if (isNaN(amount)) return player.outputChatBox("Использование: /givemoney [количество]");
        const success = await player.addMoney(amount);
        if (success) { player.outputChatBox(`[Админ] Вы выдали себе $${amount}`) }
        else { player.outputChatBox("!{#FF3333}[Ошибка] Некорректная сумма. Нужно целое число больше 0.") }
    }

    if (cmdName === "giveitem") {
        const itemId = args[0] ? args[0].toLowerCase().trim() : null;
        const count = parseInt(args[1]) || 1;
        if (!itemId) return player.outputChatBox("Использование: /giveitem [phone / burger / water] [количество]");
        const success = await inventoryService.giveItem(player, itemId, count);
        
        if (success) { player.outputChatBox(`!{#33FF33}[Админ] Получен предмет: ${itemId} (${count} шт)`) }
        else { player.outputChatBox("!{#FF3333}[Ошибка] Не удалось выдать предмет. Возможно, нет свободного слота.") }
    }

    if (cmdName === "test") {
        const cachedTotal = await getRedis().get('server:stats:total_accounts');
        const rowsForTable = await accountService.getAllAccounts();
        console.log("========== ТЕКУЩИЙ СПИСОК АККАУНТОВ В БД ==========");
        console.table(rowsForTable);
        console.log("=================================================");
        player.outputChatBox(`[Успех] Игроков в системе (из Redis): ${cachedTotal || rowsForTable.length}`);
    }

    if (cmdName === "delacc") {
        const targetUsername = args.join(" ").trim();
        if (!targetUsername) return player.outputChatBox("Использование: /delacc [логин]");

        try {
            const userToDestroy = await accountService.findByUsername(targetUsername);
            if (userToDestroy) {
                await accountService.deleteAccount(userToDestroy.id);
                player.outputChatBox(`[Успех] Аккаунт ${targetUsername} успешно удален через ORM.`);
                
                mp.players.forEach((targetPlayer) => { // перебираем игроков в онлайне, если находим то кикаем
                    if (targetPlayer.accountName && targetPlayer.accountName.toLowerCase() === targetUsername.toLowerCase()) {
                        targetPlayer.kick("Ваш аккаунт был удален администратором.");
                        console.log(`[Admin] Игрок ${targetUsername} был принудительно кикнут (аккаунт удален).`);
                    }
                })
            } else {
                player.outputChatBox("Ошибка: Данный логин не найден в базе.")
            }
        } catch (err) { console.error(err) }
    }
})