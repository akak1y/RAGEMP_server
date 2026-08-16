const accountService = require('../services/AccountService');
const authService = require('../services/AuthService');
const inventoryService = require('../services/InventoryService');
const vehicleService = require('../services/VehicleService');
const statsService = require('../services/StatsService');
const healthService = require('../services/HealthService');
const auditService = require('../services/AuditService');
const moneyService = require('../services/MoneyService');
const botService = require('../services/BotService');
const courierService = require('../services/CourierService');
const { getRedis } = require('../redis');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const withGuards = require('../middleware/withGuards');
const rateLimit = require('../middleware/rateLimit');
const { CourierConfig } = require('../config');
const logger = require('../logger');
const profile = require('../profiler');

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
    if (!player.isLoggedIn) return;

    try {
        const updateData = { money: player.money || 0 };
        if (player.lastPos) {
            updateData.pos_x = player.lastPos.x;
            updateData.pos_y = player.lastPos.y;
            updateData.pos_z = player.lastPos.z;
        }
        const saved = await accountService.updateAccount(player.accountId, updateData);
        if (saved) logger.info(`[Sequelize Save] Игрок "${player.accountName}" сохранён (позиция + деньги).`);
    } catch (err) { console.error(`[Sequelize Save Error]: ${err.message}`) }

    vehicleService.despawnPlayerVehicles(player.accountId);
    courierService.endWork(player.accountId, true);
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

mp.events.add('server:courier:interact', withGuards([isLoggedIn], (player) => {
    courierService.interact(player);
}, 'courier:interact'));

mp.events.add('server:courier:requestPos', withGuards([isLoggedIn], (player) => {
    player.call('client:courier:setPos', [CourierConfig.startPos]);
}, 'courier:requestPos'));

mp.events.add('playerDeath', (player, reason, killer) => {
    if (!player.isLoggedIn) return;
    healthService.onPlayerDeath(player)
});

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
            player.outputChatBox(`!{#00FF00}[Redis КЭШ] Игрок ${targetUsername} проверен.`);
            return
        }
        const userCheck = await accountService.findByUsername(targetUsername);
        if (!userCheck) {
            player.outputChatBox(`!{#FFaa00}[MySQL] Игрок "${targetUsername}" не найден.`);
            return
        }
        await redis.set(cacheKey, "clear", { EX: 60 });
        player.outputChatBox(`!{#FFcc00}[MySQL] Данные считаны через ORM и закэшированы на 60с.`);
    }
});

registerCommand('givemoney', {
    guards: [adminOnly],
    run: async (player, args) => {
        const amount = parseInt(args);
        if (isNaN(amount)) return player.outputChatBox("Использование: /givemoney [количество]");
        const success = await player.addMoney(amount);
        if (success) {
            player.outputChatBox(`[Админ] Вы выдали себе $${amount}`);
            auditService.logPlayer(player, 'givemoney', { category: 'money', amount });
        } else { player.outputChatBox("!{#FF3333}[Ошибка] Некорректная сумма. Нужно целое число больше 0.") }
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

registerCommand('bd', {
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
});

registerCommand('stats', {
    guards: [adminOnly],
    run: async (player) => {
        const economy = await statsService.getEconomyStats();
        const online = statsService.getOnlineStats();
        const top = await statsService.getTopPlayers(3);

        const lines = [
            `!{#00FFFF}[Stats] Онлайн: ${online.online} | Машин в мире: ${online.vehicles} | Аккаунтов: ${economy.total}`,
            `!{#00FFFF}[Stats] В экономике: $${economy.totalMoney} | В среднем: $${economy.avgMoney} | Максимум: $${economy.maxMoney}`,
            `!{#00FFFF}[Stats] Источник: ${economy.source === 'redis' ? 'Redis' : 'MySQL'} (${economy.ms} мс)`,
            `!{#00FFFF}[Stats] Топ: ` + top.map(t => `${t.username} ($${t.money})`).join(', ')
        ];
        lines.forEach(line => player.outputChatBox(line));

        player.call('client:ui:debugLog', [`[Stats] economy from ${economy.source} in ${economy.ms}ms`, 'cpp-event']);
    }
});

registerCommand('sethp', {
    guards: [adminOnly],
    run: (player, args) => {
        const value = Number(args[0]);
        if (!args[0] || Number.isNaN(value)) return player.outputChatBox('!{#FF3333}Использование: /sethp [1-100]');
        const hp = healthService.setHealth(player, value);
        player.outputChatBox(`!{#00FFFF}[HP] Здоровье установлено: ${hp}`);
    }
});

registerCommand('heal', {
    guards: [adminOnly],
    run: (player) => {
        healthService.setHealth(player, 100);
        player.outputChatBox('!{#00FF00}[HP] Вы полностью вылечены');
    }
});

registerCommand('kill', {
    guards: [isLoggedIn],
    run: (player) => { player.health = 0 }
});

registerCommand('audit', {
    guards: [adminOnly],
    run: async (player, args) => {
        const limit = Math.min(Number(args[0]) || 10, 50);
        const rows = await auditService.getRecent(limit, args[1] || null);
        player.outputChatBox(`!{#FFFF00}[Audit] Записей: ${rows.length}`);
        rows.forEach(r => {
            const date = new Date(r.created_at).toLocaleString('ru-RU');
            const amount = r.amount != null ? ` $${r.amount}` : '';
            const repeats = r.repeats ? ` x${r.repeats}` : '';
            const target = r.target ? ` → ${r.target}` : '';
            const ok = r.success ? '' : ' [FAIL]';
            player.outputChatBox(`!{#B0C4DE}[${date}] ${r.actor}: ${r.action}${target}${amount}${repeats}${ok}`);
        });
    }
});

registerCommand('pay', {
    guards: [isLoggedIn],
    run: async (player, args) => {
        const [arg, amountRaw] = args;
        const amount = Number(amountRaw);
        if (!arg || !Number.isInteger(amount) || amount <= 0) return player.outputChatBox('!{#FF3333}Использование: /pay [ник или ID аккаунта] [сумма]');

        let targetPlayer = null, targetName = null, targetAccountId = null;

        if (/^\d+$/.test(arg)) {
            targetAccountId = Number(arg);
            targetPlayer = mp.players.toArray().find(p => p.isLoggedIn && p.accountId === targetAccountId);
            if (targetPlayer) targetName = targetPlayer.accountName;
            else targetName = botService.getNameByAccountId(targetAccountId);
        } else {
            targetPlayer = mp.players.toArray().find(p =>
                p.isLoggedIn && (p.accountName || '').toLowerCase() === arg.toLowerCase());
            if (targetPlayer) {
                targetName = targetPlayer.accountName;
                targetAccountId = targetPlayer.accountId;
            } else {
                targetName = botService.findBotName(arg);
                if (targetName) targetAccountId = botService.getAccountId(targetName);
            }
        }

        if (!targetName) return player.outputChatBox('!{#FF3333}Игрок не найден или не в сети');
        if (targetAccountId === player.accountId) return player.outputChatBox('!{#FF3333}Нельзя перевести самому себе');

        const ok = await moneyService.transfer(player.accountId, targetAccountId, amount, 'pay');
        if (!ok) return player.outputChatBox('!{#FF3333}Недостаточно средств');

        player.applyMoneyDelta(-amount);
        if (targetPlayer) targetPlayer.applyMoneyDelta(amount);
        player.outputChatBox(`!{#00FF00}Вы перевели $${amount} игроку ${targetName}`);
        if (targetPlayer) targetPlayer.outputChatBox(`!{#00FF00}Вам перевод $${amount} от ${player.accountName}`);
        
        auditService.logPlayer(player, 'pay', { category: 'money', amount, target: targetAccountId, details: { target_name: targetName } });
    }
});

registerCommand('endwork', {
    guards: [isLoggedIn],
    run: (player) => {
        if (!courierService.isWorking(player.accountId)) return player.outputChatBox('!{#FF3333}[Курьер] Вы не работаете курьером.');
        courierService.endWork(player.accountId);
    }
});

registerCommand('bench', {
    guards: [adminOnly],
    run: async (player, args) => {
        const iterations = Math.min(Number(args[0]) || 50, 100);

        const bench = await statsService.benchmarkRedis(iterations);
        await statsService.invalidateEconomyCache();
        const cold = await statsService.getEconomyStats();
        const warm = await statsService.getEconomyStats();

        player.outputChatBox(`!{#00FFFF}[Bench] Redis синтетика (${bench.iterations} GET): ${bench.avgMs} мс/запрос`);
        player.outputChatBox(`!{#FFcc00}[Bench] MySQL холодный (агрегация): ${cold.ms} мс`);
        player.outputChatBox(`!{#00FF00}[Bench] Redis тёплый (реальный GET): ${warm.ms} мс`);
    }
});