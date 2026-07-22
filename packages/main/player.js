const { getUserModel } = require('./models/Users');
const User = getUserModel();
const bcrypt = require('bcryptjs');
const logger = require('./logger');
const profile = require('./profiler');

mp.Player.prototype.addMoney = async function(amount) {
    try {
        this.money += amount;
        this.call('client:updateMoney', [this.money]);

        const userDb = await User.findByPk(this.accountId); // через Sequelize ищем игрока в бд и обновляем значение
        if (userDb) {
            userDb.money = this.money;
            await userDb.save()
        }
    } catch (err) { console.error(`[Sequelize Error] addMoney: ${err.message}`) }
};

mp.Player.prototype.takeMoney = async function(amount) {
    if (this.money < amount) return false; // проверка на наличие необходимой суммы
    try {
        this.money -= amount;
        this.call('client:updateMoney', [this.money]);
        const userDb = await User.findByPk(this.accountId);
        if (userDb) {
            userDb.money = this.money;
            await userDb.save();
            return true
        }
        return false
    } catch (err) {
        console.error(`[Sequelize Error] takeMoney: ${err.message}`);
        return false
    }
};

mp.events.add('server:account:login', async (player, username, password) => { // авторизация и регистрация в одном событии
    logger.info(`Игрок ${username} инициировал процесс входа на сервер.`);

    try {
        const userDb = await profile(`Sequelize:FindUser:${username}`, async () => { // оборачиваем в профилировщик
            return await User.findOne({ where: { username: username.trim().toLowerCase() } }) // ищем в бд первое вхождение username
        });
        
        if (userDb) { // если аккаунт был найден в бд
            const passwordMatch = await profile('Bcrypt:ComparePassword', async () => {
                return await bcrypt.compare(password, userDb.password) // сверяем зашифрованный пароль
            });

            if (!passwordMatch) { // если пароли не совпали
                logger.warn(`Игрок ${username} ввел неверный пароль.`);
                player.call('client:account:authError', ['Неверный пароль!']);
                return
            }
            
            player.isLoggedIn = true; // если совпали
            player.accountId = userDb.id;
            player.accountName = userDb.username;
            player.money = userDb.money;
            player.adminLevel = userDb.admin_level;
            player.lastPos = new mp.Vector3(userDb.pos_x, userDb.pos_y, userDb.pos_z) // заполняем кэш данными из бд
        } else { // если не был найден в бд -> регистрация
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt); // шифруем пароль
            
            const newUser = await profile('Sequelize:CreateUser', async () => { // создаём новый аккаунт в бд с заданными данными
                return await User.create({
                    username: username.trim(),
                    password: hashedPassword,
                    hwid: player.serial || '',
                    money: 50000,
                    admin_level: 1,
                    pos_x: -2183.0, pos_y: 4268.0, pos_z: 48.0
                })
            });
            
            player.isLoggedIn = true;
            player.accountId = newUser.id;
            player.accountName = newUser.username;
            player.money = newUser.money;
            player.adminLevel = newUser.admin_level;
            player.lastPos = new mp.Vector3(newUser.pos_x, newUser.pos_y, newUser.pos_z);
            
            const { getRedis } = require('./redis');
            await getRedis().incr('server:stats:total_accounts'); // +1 в статистику аккаунтов сразу в ОЗУ
            logger.info(`Зарегистрирован новый аккаунт: ${player.accountName}. Кэш Redis инкрементирован.`)
        }

        player.posTracker = setInterval(() => { // запускаем таймер позиции и обновляем в ОЗУ раз в 3 сек
            if (mp.players.exists(player) && player.position){
                player.lastPos = player.position
            }
        }, 3000);

        const { loadPlayerInventory } = require('./inventory');
        await loadPlayerInventory(player);

        player.call('client:account:hideAuth');
        player.call('client:updateMoney', [player.money]);
        player.spawn(player.lastPos)
    } catch (err) { player.call('client:account:authError', ['Внутренняя ошибка сервера базы данных.']) }
});

mp.events.add('playerQuit', async (player) => {
    if (player.posTracker) clearInterval(player.posTracker); // уничтожаем таймер обновления позиции
    if (!player.isLoggedIn || !player.lastPos) return;

    try {
        const userDb = await User.findByPk(player.accountId);
        if (userDb) {
            userDb.pos_x = player.lastPos.x;
            userDb.pos_y = player.lastPos.y;
            userDb.pos_z = player.lastPos.z;
            await userDb.save(); // сохраняем актуальные координаты
            logger.info(`[Sequelize Save] Позиция игрока "${player.accountName}" успешно обновлена.`)
        }
    } catch (err) { console.error(`[Sequelize Save Error]: ${err.message}`) }
});

mp.events.add("server:requestRedisStats", async (player) => { // добавляем мост для обновления счётчиков акк-ов
    if (!player.isLoggedIn) return; // защита
    try {
        const { getRedis } = require('./redis');
        const redis = getRedis();
        const cachedTotal = await redis.get('server:stats:total_accounts'); // вытаскиваем данные из ОЗУ
        if (cachedTotal === null) { // если в ОЗУ нет данных, вытаскиваем из бд
            const countFromDb = await User.count();
            logger.warn('[Redis Error] Сработал запрос в БД');
            await redis.set('server:stats:total_accounts', countFromDb, { EX: 3600 });
            cachedTotal = countFromDb
        }
        player.call("client:setRedisStats", [parseInt(cachedTotal) || 0]) // отправляем цифру на клиет игрока
    } catch (err) { console.error(`[MySQL/Redis Error] Не удалось отправить статистику: ${err.message}`) }
})