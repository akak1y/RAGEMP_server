const moneyService = require('../services/MoneyService');
const botService = require('../services/BotService');
const auditService = require('../services/AuditService');
const isLoggedIn = require('../middleware/isLoggedIn');
const { registerCommand } = require('./commandSystem');

/**
 * Игровые команды.
 */

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