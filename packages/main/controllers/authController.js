const accountService = require('../services/AccountService');
const authService = require('../services/AuthService');
const inventoryService = require('../services/InventoryService');
const vehicleService = require('../services/VehicleService');
const courierService = require('../services/CourierService');
const { getRedis } = require('../redis');
const withGuards = require('../middleware/withGuards');
const logger = require('../logger');
const profile = require('../profiler');

/**
 * Сессия игрока: вход/регистрация и выход с сохранением прогресса.
 */

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