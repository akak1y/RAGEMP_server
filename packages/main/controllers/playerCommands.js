const accountService = require('../services/AccountService');
const moneyService = require('../services/MoneyService');
const courierService = require('../services/CourierService');
const healthService = require('../services/HealthService');
const botService = require('../services/BotService');
const auditService = require('../services/AuditService');
const { getRedis } = require('../redis');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const { registerCommand } = require('./commandSystem');
const { CourierConfig } = require('../config');
const logger = require('../logger');

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