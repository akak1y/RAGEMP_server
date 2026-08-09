const { getBotModel, ensureBotReady } = require('../models/Bot');
const accountService = require('./AccountService');
const { BotSpawnPos } = require('../config');
const logger = require('../logger');

/**
 * BotService — тестовый бот для мультиплеер-тестов
 */
class BotService {
    constructor() {
        this.bots = new Map(); // name → { ped, label, accountId }
        mp.events.add('playerReady', (player) => this.sendBotsTo(player));
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
                    money: 10000
                });
                logger.info(`[BotService] Создан аккаунт для бота: ${botName} (ID ${account.id})`);
            }

            const Bot = getBotModel();
            await Bot.upsert({
                name: botName,
                account_id: account.id,
                position: `${BotSpawnPos.x},${BotSpawnPos.y},${BotSpawnPos.z},${BotSpawnPos.h}`
            });

            const ped = mp.peds.new(
                mp.joaat('g_m_m_korboss_01'),
                new mp.Vector3(BotSpawnPos.x, BotSpawnPos.y, BotSpawnPos.z),
                BotSpawnPos.h, 0
            );
            try { ped.rotation = new mp.Vector3(0, 0, BotSpawnPos.h); } catch (e) {}

            const label = mp.labels.new(
                botName + ' (' + account.id + ')',
                new mp.Vector3(BotSpawnPos.x, BotSpawnPos.y, BotSpawnPos.z + 1.0),
                { color: [255, 255, 255, 255], drawDistance: 50, los: true }
            );

            this.bots.set(botName, { ped, label, accountId: account.id });
            mp.players.forEach(p => p.call('client:bot:setup', [ped.id, BotSpawnPos.h]));
            logger.info(`[BotService] Бот ${botName} заспавнен`);
        } catch (err) { logger.error(`[BotService] Ошибка спавна: ${err.message}`) }
    }

    sendBotsTo(player) {
        for (const [, bot] of this.bots) { player.call('client:bot:setup', [bot.ped.id, BotSpawnPos.h]) }
    }

    getAccountId(botName) {
        const bot = this.bots.get(botName);
        return bot ? bot.accountId : null;
    }

    isBot(name) { return this.bots.has(name) }
}

module.exports = new BotService()