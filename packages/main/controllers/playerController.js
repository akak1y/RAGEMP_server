const accountService = require('../services/AccountService');
const authService = require('../services/AuthService');
const inventoryService = require('../services/InventoryService');
const vehicleService = require('../services/VehicleService');
const { getRedis } = require('../redis');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const withGuards = require('../middleware/withGuards');
const logger = require('../logger');
const profile = require('../profiler');
const { performance } = require('perf_hooks');

const adminOnly = isAdmin(1);
const moderatorOnly = isAdmin(2);
const developerOnly = isAdmin(3);

// ============================================================

mp.Player.prototype.addMoney = async function(amount, reason = '') {
    try {
        const success = await require('../services/MoneyService').addMoney(this.accountId, amount, reason);
        if (success) {
            this.money += amount;
            this.call('client:updateMoney', [this.money]);
        }
        return success
    } catch (err) { console.error(`[Sequelize Error] addMoney: ${err.message}`); return false }
};

mp.Player.prototype.takeMoney = async function(amount, reason = '') {
    try {
        const success = await require('../services/MoneyService').takeMoney(this.accountId, amount, reason);
        if (success) {
            this.money -= amount;
            this.call('client:updateMoney', [this.money]);
        }
        return success
    } catch (err) {
        console.error(`[Sequelize Error] takeMoney: ${err.message}`);
        return false
    }
};

mp.Player.prototype.applyMoneyDelta = function(delta) {
    this.money += delta;
    this.call('client:updateMoney', [this.money]);
};

// ============================================================

mp.events.add('server:account:login', withGuards([], async (player, username, password) => {
    logger.info(`Игрок ${username} инициировал процесс входа на сервер.`);

    try {
        const authResult = await profile(`Auth:Login:${username}`, async () => {
            return await authService.authenticate(username, password)
        });

        let userDb;

        if (authResult.success) { // если пароли совпали
            userDb = authResult.user;
        } else if (authResult.error === 'wrong_password') { // если пароли не совпали
            player.call('client:account:authError', ['Неверный пароль!']);
            return
        } else { // если не был найден в бд -> регистрация
            const regResult = await profile(`Auth:Register:${username}`, async () => {
                return await authService.register(username, password, {
                    hwid: player.serial || '',
                    money: 50000,
                    admin_level: 1 // ВАЖНО: сохранено как в оригинале
                })
            });

            if (!regResult.success) {
                player.call('client:account:authError', [regResult.error === 'username_taken' ? 'Этот логин уже занят!' : 'Некорректный логин.']);
                return
            }
            userDb = regResult.user;

            await getRedis().incr('server:stats:total_accounts'); // +1 в статистику аккаунтов сразу в ОЗУ
            logger.info(`Зарегистрирован новый аккаунт: ${userDb.username}. Кэш Redis инкрементирован.`)
        }

        player.isLoggedIn = true;
        player.accountId = userDb.id;
        player.accountName = userDb.username;
        player.money = userDb.money;
        player.adminLevel = userDb.admin_level;
        player.lastPos = new mp.Vector3(userDb.pos_x, userDb.pos_y, userDb.pos_z) // заполняем кэш данными из бд

        player.posTracker = setInterval(() => { // запускаем таймер позиции и обновляем в ОЗУ раз в 3 сек
            if (mp.players.exists(player) && player.position){
                player.lastPos = player.position
            }
        }, 3000);

        await inventoryService.loadPlayerInventory(player);

        const isDeveloper = player.adminLevel;
        player.call('client:account:hideAuth', [isDeveloper]);
        player.call('client:updateMoney', [player.money]);
        player.spawn(player.lastPos)
    } catch (err) { player.call('client:account:authError', ['Внутренняя ошибка сервера базы данных.']) }
}, 'account:login'));

mp.events.add('playerQuit', withGuards([], async (player) => {
    if (player.posTracker) clearInterval(player.posTracker); // уничтожаем таймер обновления позиции
    if (!player.isLoggedIn || !player.lastPos) return;

    try {
        const saved = await accountService.updatePosition(player.accountId, player.lastPos);
        if (saved) logger.info(`[Sequelize Save] Позиция игрока "${player.accountName}" успешно обновлена.`);
    } catch (err) { console.error(`[Sequelize Save Error]: ${err.message}`) }

    vehicleService.destroyPlayerVehicles(player.accountId);
}, 'playerQuit'));

mp.events.add("server:requestRedisStats", withGuards([isLoggedIn], async (player) => { // мост для обновления счётчиков акк-ов
    const redis = getRedis();
    let cachedTotal = await redis.get('server:stats:total_accounts'); // вытаскиваем данные из ОЗУ
    if (cachedTotal === null) { // если в ОЗУ нет данных, вытаскиваем из бд
        const countFromDb = await accountService.getTotalCount();
        logger.warn('[Redis Error] Сработал запрос в БД');
        await redis.set('server:stats:total_accounts', countFromDb, { EX: 3600 });
        cachedTotal = countFromDb
    }
    player.call("client:setRedisStats", [parseInt(cachedTotal) || 0]) // отправляем цифру на клиент игрока
}, 'requestRedisStats'));

// ============================================================

const commands = new Map();

function registerCommand(name, def) {
    commands.set(name, def);
}

mp.events.add('playerCommand', withGuards([isLoggedIn], async (player, command) => {
    const args = command.split(/[ ]+/);
    const cmdName = args.shift().toLowerCase();
    const cmd = commands.get(cmdName);
    if (!cmd) return;
    for (const guard of cmd.guards) {
        if (!guard(player)) return player.outputChatBox("!{#FF3333}[Ошибка] Недостаточно прав для этой команды.");
    }
    await cmd.run(player, args);
}, 'playerCommand'));

registerCommand('checkban', {
    guards: [adminOnly],
    run: async (player, args) => {
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
});

registerCommand('givemoney', {
    guards: [adminOnly],
    run: async (player, args) => {
        const amount = parseInt(args);
        if (isNaN(amount)) return player.outputChatBox("Использование: /givemoney [количество]");
        const success = await player.addMoney(amount);
        if (success) { player.outputChatBox(`[Админ] Вы выдали себе $${amount}`) }
        else { player.outputChatBox("!{#FF3333}[Ошибка] Некорректная сумма. Нужно целое число больше 0.") }
    }
});

registerCommand('giveitem', {
    guards: [adminOnly],
    run: async (player, args) => {
        const itemId = args[0] ? args[0].toLowerCase().trim() : null;
        const count = parseInt(args[1]) || 1;
        if (!itemId) return player.outputChatBox("Использование: /giveitem [phone / burger / water] [количество]");
        const success = await inventoryService.giveItem(player, itemId, count);
        if (success) { player.outputChatBox(`!{#33FF33}[Админ] Получен предмет: ${itemId} (${count} шт)`) }
        else { player.outputChatBox("!{#FF3333}[Ошибка] Не удалось выдать предмет. Возможно, нет свободного слота.") }
    }
});

registerCommand('test', {
    guards: [adminOnly],
    run: async (player, args) => {
        const cachedTotal = await getRedis().get('server:stats:total_accounts');
        const rowsForTable = await accountService.getAllAccounts();
        console.log("========== ТЕКУЩИЙ СПИСОК АККАУНТОВ В БД ==========");
        console.table(rowsForTable);
        console.log("=================================================");
        player.outputChatBox(`[Успех] Игроков в системе (из Redis): ${cachedTotal || rowsForTable.length}`);
    }
});

registerCommand('delacc', {
    guards: [moderatorOnly],
    run: async (player, args) => {
        const targetUsername = args.join(" ").trim();
        if (!targetUsername) return player.outputChatBox("Использование: /delacc [логин]");

        const userToDestroy = await accountService.findByUsername(targetUsername);
        if (userToDestroy) {
            await accountService.deleteAccount(userToDestroy.id);
            player.outputChatBox(`[Успех] Аккаунт ${targetUsername} успешно удален через ORM.`);
            mp.players.forEach((targetPlayer) => {
                if (targetPlayer.accountName && targetPlayer.accountName.toLowerCase() === targetUsername.toLowerCase()) {
                    targetPlayer.kick("Ваш аккаунт был удален администратором.");
                    console.log(`[Admin] Игрок ${targetUsername} был принудительно кикнут (аккаунт удален).`);
                }
            })
        } else { player.outputChatBox("Ошибка: Данный логин не найден в базе.") }
    }
})