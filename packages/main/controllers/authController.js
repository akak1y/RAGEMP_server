const accountService = require('../services/AccountService');
const authService = require('../services/AuthService');
const inventoryService = require('../services/InventoryService');
const vehicleService = require('../services/VehicleService');
const courierService = require('../services/CourierService');
const miningService = require('../services/MiningService');
const weaponService = require('../services/WeaponService');
const healthService = require('../services/HealthService');
const chatService = require('../services/ChatService');
const tuningService = require('../services/TuningService');
const armoryService = require('../services/ArmoryService');
const { getRedis } = require('../core/redis');
const withGuards = require('../middleware/withGuards');
const rateLimit = require('../middleware/rateLimit');
const logger = require('../core/logger');
const profile = require('../core/profiler');
const { sendEvent } = require('../core/eventSender');

/**
 * Сессия игрока: вход/регистрация и выход с сохранением прогресса.
 */

/**
 * Очищает частично созданную сессию игрока.
 * @param {mp.Player} player
 */
function clearAuthSession(player) {
    if (!player) return;

    if (player.posTracker) {
        clearInterval(player.posTracker);
        player.posTracker = null;
    }

    player.isLoggedIn = false;
    player.accountId = null;
    player.accountName = null;
    player.money = 0;
    player.adminLevel = 0;
    player.lastPos = null;
    player.inventory = null;

    try {
        if (
            typeof mp !== 'undefined' &&
            mp.Player &&
            mp.Player.prototype &&
            typeof mp.Player.prototype.outputChatBox === 'function'
        ) {
            player.outputChatBox = mp.Player.prototype.outputChatBox;
        } else if (Object.prototype.hasOwnProperty.call(player, 'outputChatBox')) {
            delete player.outputChatBox;
        }
    } catch (err) {
        logger.warn(`[Auth] Не удалось сбросить outputChatBox: ${err.message}`);
    }
}

mp.events.add(
    'server:account:login',
    withGuards(
        [rateLimit('account:login', 5, 60)],
        async (player, username, password) => {
            logger.info(`Игрок ${username} инициировал процесс входа на сервер.`);

            let userDb = null;
            try {
                const authResult = await profile(`Auth:Login:${username}`, async () => {
                    return await authService.authenticate(username, password);
                });

                if (authResult.success) {
                    // если пароли совпали
                    userDb = authResult.user;
                } else if (authResult.error === 'wrong_password') {
                    // если пароли не совпали
                    sendEvent(player, 'client:account:authError', ['Неверный пароль!']);
                    return;
                } else {
                    // если не был найден в бд -> регистрация
                    const regResult = await profile(`Auth:Register:${username}`, async () => {
                        return await authService.register(username, password, {
                            hwid: player.serial || '',
                            money: 50000,
                            admin_level: 1, // ВАЖНО: сохранено как в оригинале
                        });
                    });

                    if (!regResult.success) {
                        sendEvent(player, 'client:account:authError', [
                            regResult.error === 'username_taken'
                                ? 'Этот логин уже занят!'
                                : 'Некорректный логин.',
                        ]);
                        return;
                    }
                    userDb = regResult.user;
                    try {
                        const redis = getRedis();
                        if (redis) await redis.incr('server:stats:total_accounts');
                        logger.info(
                            `Зарегистрирован новый аккаунт: ${userDb.username}. Кэш Redis инкрементирован.`
                        );
                    } catch (err) {
                        logger.warn(
                            `[Auth] Не удалось обновить счётчик аккаунтов в Redis: ${err.message}`
                        );
                    }
                }
            } catch (err) {
                logger.error(`[Auth] Ошибка входа/регистрации ${username}: ${err.message}`);
                sendEvent(player, 'client:account:authError', [
                    'Внутренняя ошибка сервера базы данных.',
                ]);
                return;
            }

            if (!userDb) {
                logger.error(`[Auth] Пустой результат входа для ${username}`);
                sendEvent(player, 'client:account:authError', [
                    'Внутренняя ошибка сервера базы данных.',
                ]);
                return;
            }

            player.accountId = userDb.id;
            player.accountName = userDb.username;
            player.money = Number(userDb.money) || 0;
            player.adminLevel = Number(userDb.admin_level) || 0;
            player.lastPos = new mp.Vector3(userDb.pos_x, userDb.pos_y, userDb.pos_z);

            try {
                await inventoryService.loadPlayerInventory(player);
            } catch (err) {
                logger.error(
                    `[Auth] Не удалось загрузить инвентарь игрока ${userDb.username}: ${err.message}`
                );
                clearAuthSession(player);
                sendEvent(player, 'client:account:authError', [
                    'Не удалось загрузить инвентарь. Попробуйте позже.',
                ]);
                return;
            }

            try {
                player.isLoggedIn = true;

                player.outputChatBox = function (text, opts) {
                    if (opts && opts.toast) chatService.notify(this, text);
                    else chatService.pushSystem(this, text);
                };

                player.posTracker = setInterval(() => {
                    // запускаем таймер позиции и обновляем в ОЗУ раз в 3 сек
                    if (mp.players.exists(player) && player.position) {
                        player.lastPos = player.position;
                    }
                }, 3000);

                const isDeveloper = player.adminLevel;
                sendEvent(player, 'client:account:hideAuth', [isDeveloper]);
                sendEvent(player, 'client:updateMoney', [player.money]);
                player.spawn(player.lastPos);
                logger.info(`[Auth] Игрок ${player.accountName} успешно вошёл на сервер.`);
            } catch (err) {
                logger.error(
                    `[Auth] Не удалось завершить вход игрока ${player.accountName || username}: ${err.message}`
                );
                clearAuthSession(player);
                sendEvent(player, 'client:account:authError', [
                    'Внутренняя ошибка сервера при входе.',
                ]);
            }
        },
        'account:login'
    )
);

mp.events.add(
    'playerQuit',
    withGuards(
        [],
        async (player) => {
            if (player.posTracker) clearInterval(player.posTracker); // уничтожаем таймер обновления позиции
            if (!player.isLoggedIn) return;
            healthService.onDisconnect(player.accountId);
            try {
                await weaponService.holster(player);
            } catch (err) {
                logger.error(`[Weapon] holster при выходе ${player.accountName}: ${err.message}`);
            }

            try {
                const updateData = { money: player.money || 0 };
                if (player.lastPos) {
                    updateData.pos_x = player.lastPos.x;
                    updateData.pos_y = player.lastPos.y;
                    updateData.pos_z = player.lastPos.z;
                }
                const saved = await accountService.updateAccount(player.accountId, updateData);
                if (saved)
                    logger.info(
                        `[Sequelize Save] Игрок "${player.accountName}" сохранён (позиция + деньги).`
                    );
            } catch (err) {
                logger.error(`[Sequelize Save Error]: ${err.message}`);
            }

            try {
                await armoryService.returnAll(player, 'quit');
            } catch (err) {
                logger.error(`[Armory] ошибка авто-возврата займов при выходе: ${err.message}`);
            }

            try {
                await vehicleService.despawnPlayerVehicles(player.accountId);
            } catch (err) {
                logger.error(
                    `[Vehicle] ошибка деспауна транспорта при выходе ${player.accountName}: ${err.message}`
                );
            }

            try {
                courierService.endWork(player.accountId, true);
            } catch (err) {
                logger.error(`[Courier] ошибка завершения работы при выходе: ${err.message}`);
            }

            try {
                miningService.endWork(player);
            } catch (err) {
                logger.error(`[Mining] ошибка завершения смены при выходе: ${err.message}`);
            }

            try {
                tuningService.cleanupOnQuit(player);
            } catch (err) {
                logger.error(`[Tuning] ошибка очистки LSC при выходе: ${err.message}`);
            }
        },
        'playerQuit'
    )
);
