const { getBotModel, ensureBotReady } = require('../models/Bot');
const accountService = require('./AccountService');
const { BotSpawnPos, BotPedModel } = require('../config');
const logger = require('../core/logger');

/**
 * BotService — тестовый бот для мультиплеер-тестов
 */
const GREETINGS = [
    'Эй, шахтёр! Неси руду, если есть!',
    'Закупаю руду по хорошей цене, подходи!',
    'Чем больше руды — тем больше денег, брат.',
    'Шахта ждёт тебя, а я жду добычу!',
];

class BotService {
    constructor() {
        this.bots = new Map(); // name → { ped, label, accountId, shape, greeted }
        this.shapes = new Map(); // colshape → botName
        mp.events.add('playerReady', (player) => this.sendBotsTo(player));

        // речь: приветствие при входе в радиус бота
        mp.events.add('playerEnterColshape', (player, shape) => {
            const botName = this.shapes.get(shape);
            if (!botName || !player.isLoggedIn) return;
            const bot = this.bots.get(botName);
            if (!bot || bot.greeted.has(player.accountId)) return;
            bot.greeted.add(player.accountId);
            const phrase = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
            player.outputChatBox(`!{#FFD700}[${botName}] ${phrase}`);
        });

        // вышел из радиуса — при следующем подходе приветствуем снова
        mp.events.add('playerExitColshape', (player, shape) => {
            const botName = this.shapes.get(shape);
            if (!botName) return;
            const bot = this.bots.get(botName);
            if (bot) bot.greeted.delete(player.accountId);
        });
    }

    async spawn(botName = 'TestBot') {
        try {
            await ensureBotReady();

            const User = accountService.getModel();
            let account = await User.findOne({ where: { username: botName } });
            if (!account) {
                account = await User.create({
                    username: botName,
                    password: 'bot_no_login',
                    money: 10000,
                });
                logger.info(`[BotService] Создан аккаунт для бота: ${botName} (ID ${account.id})`);
            }

            const Bot = getBotModel();
            await Bot.upsert({
                name: botName,
                account_id: account.id,
                position: `${BotSpawnPos.x},${BotSpawnPos.y},${BotSpawnPos.z},${BotSpawnPos.h}`,
            });

            const ped = mp.peds.new(
                mp.joaat(BotPedModel),
                new mp.Vector3(BotSpawnPos.x, BotSpawnPos.y, BotSpawnPos.z),
                BotSpawnPos.h,
                0
            );
            try {
                ped.rotation = new mp.Vector3(0, 0, BotSpawnPos.h);
            } catch (err) {
                logger.error(`[BotService] Ошибка ped.rotation: ${err.message}`);
            }

            const label = mp.labels.new(
                botName + ' (' + account.id + ')',
                new mp.Vector3(BotSpawnPos.x, BotSpawnPos.y, BotSpawnPos.z + 1.0),
                { color: [255, 255, 255, 255], drawDistance: 50, los: true }
            );

            const shape = mp.colshapes.newSphere(BotSpawnPos.x, BotSpawnPos.y, BotSpawnPos.z, 5);
            this.shapes.set(shape, botName);

            this.bots.set(botName, {
                ped,
                label,
                accountId: account.id,
                shape,
                greeted: new Set(),
            });
            mp.players.forEach((p) => p.call('client:bot:setup', [ped.id, BotSpawnPos.h]));
            logger.info(`[BotService] Бот ${botName} заспавнен`);
        } catch (err) {
            logger.error(`[BotService] Ошибка спавна: ${err.message}`);
        }
    }

    sendBotsTo(player) {
        for (const [, bot] of this.bots) {
            player.call('client:bot:setup', [bot.ped.id, BotSpawnPos.h]);
        }
    }

    getAccountId(botName) {
        const bot = this.bots.get(botName);
        return bot ? bot.accountId : null;
    }

    isBot(name) {
        return this.bots.has(name);
    }

    findBotName(nick) {
        for (const [name] of this.bots) {
            if (name.toLowerCase() === nick.toLowerCase()) return name;
        }
        return null;
    }

    getNameByAccountId(accountId) {
        for (const [name, bot] of this.bots) {
            if (bot.accountId === accountId) return name;
        }
        return null;
    }
}

module.exports = new BotService();
