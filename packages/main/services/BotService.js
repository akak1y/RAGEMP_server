const { getBotModel, ensureBotReady } = require('../models/Bot');
const accountService = require('./AccountService');
const { BotConfig } = require('../config');
const logger = require('../core/logger');
const { sendEvent } = require('../core/eventSender');

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

    /**
     * Отправить данные бота: одному игроку или всем сразу
     * @private
     */
    #broadcastBotSetup(pedId, heading, targetPlayer = null) {
        if (targetPlayer) {
            sendEvent(targetPlayer, 'client:bot:setup', [pedId, heading]);
        } else {
            mp.players.forEach((p) => sendEvent(p, 'client:bot:setup', [pedId, heading]));
        }
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
                position: `${BotConfig.position.x},${BotConfig.position.y},${BotConfig.position.z},${BotConfig.position.h}`,
            });

            const ped = mp.peds.new(
                mp.joaat(BotConfig.pedMode),
                new mp.Vector3(BotConfig.position.x, BotConfig.position.y, BotConfig.position.z),
                BotConfig.position.h,
                0
            );
            try {
                ped.rotation = new mp.Vector3(0, 0, BotConfig.position.h);
            } catch (err) {
                logger.error(`[BotService] Ошибка ped.rotation: ${err.message}`);
            }

            const label = mp.labels.new(
                botName + ' (' + account.id + ')',
                new mp.Vector3(
                    BotConfig.position.x,
                    BotConfig.position.y,
                    BotConfig.position.z + 1.0
                ),
                {
                    color: [255, 255, 255, 255],
                    drawDistance: BotConfig.labelDrawDistance,
                    los: true,
                }
            );

            const shape = mp.colshapes.newSphere(
                BotConfig.position.x,
                BotConfig.position.y,
                BotConfig.position.z,
                BotConfig.greetingRadius
            );
            this.shapes.set(shape, botName);

            this.bots.set(botName, {
                ped,
                label,
                accountId: account.id,
                shape,
                greeted: new Set(),
            });

            this.#broadcastBotSetup(ped.id, BotConfig.position.h);
            logger.info(`[BotService] Бот ${botName} заспавнен`);
        } catch (err) {
            logger.error(`[BotService] Ошибка спавна: ${err.message}`);
        }
    }

    sendBotsTo(player) {
        for (const [, bot] of this.bots) {
            this.#broadcastBotSetup(bot.ped.id, BotConfig.position.h, player);
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
