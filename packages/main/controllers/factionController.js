const factionService = require('../services/FactionService');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { registerCommand } = require('./commandSystem');
const { sendEvent } = require('../core/eventSender');

/**
 * Фракции: инфо для UI, касса (взнос/вывод), открытие окна.
 */

const adminOnly = isAdmin(1);

function findOnlinePlayer(arg) {
    if (!arg) return null;
    const list = mp.players.toArray().filter((p) => p.isLoggedIn);
    if (/^\d+$/.test(arg)) return list.find((p) => p.accountId === Number(arg));
    return list.find((p) => (p.accountName || '').toLowerCase() === String(arg).toLowerCase());
}

/**
 * отправить клиенту текущее состояние фракции
 */
async function sendFactionInfo(player) {
    const membership = await factionService.getMembership(player.accountId);
    if (!membership) {
        return sendEvent(player, 'client:faction:setInfo', ['null']);
    }
    const members = await factionService.getMembers(membership.faction.id);
    sendEvent(player, 'client:faction:setInfo', [
        JSON.stringify({
            faction: {
                id: membership.faction.id,
                name: membership.faction.name,
                treasury: membership.faction.treasury,
            },
            me: {
                rank: membership.member.rank,
                rankName: factionService.rankName(membership.member.rank),
            },
            members: members.map((m) => ({
                accountId: m.account_id,
                rank: m.rank,
                rankName: factionService.rankName(m.rank),
            })),
            ranks: factionService.getRanks(),
        }),
    ]);
}

mp.events.add(
    'server:faction:requestInfo',
    withGuards(
        [isLoggedIn],
        async (player) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership) {
                player.outputChatBox('!{#FF3333}[Фракция] Вы не состоите во фракции.');
            }
            await sendFactionInfo(player);
        },
        'faction:requestInfo'
    )
);

// открытие окна - E на метке базы
mp.events.add(
    'server:faction:open',
    withGuards(
        [isLoggedIn, rateLimit('faction:open', 3, 10)],
        async (player) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership && (player.adminLevel || 0) < 1) {
                return player.outputChatBox('!{#FF3333}[Семья] Вы не состоите в семье.');
            }
            sendEvent(player, 'client:faction:open', []);
            await sendFactionInfo(player);
        },
        'faction:open'
    )
);

mp.events.add(
    'server:faction:deposit',
    withGuards(
        [isLoggedIn, rateLimit('faction:deposit', 3, 10)],
        async (player, sum) => {
            const result = await factionService.deposit(player, sum);
            sendEvent(player, 'client:faction:moneyResult', [
                result.success,
                result.error || 'deposit',
            ]);
            if (result.success) await sendFactionInfo(player); // обновить казну в окне
        },
        'faction:deposit'
    )
);

mp.events.add(
    'server:faction:withdraw',
    withGuards(
        [isLoggedIn, rateLimit('faction:withdraw', 3, 10)],
        async (player, sum) => {
            const result = await factionService.withdraw(player, sum);
            sendEvent(player, 'client:faction:moneyResult', [
                result.success,
                result.error || 'withdraw',
            ]);
            if (result.success) await sendFactionInfo(player);
        },
        'faction:withdraw'
    )
);

// --- админ-команда открытия окна---

registerCommand('fam', {
    guards: [isLoggedIn, adminOnly],
    run: async (player) => {
        sendEvent(player, 'client:faction:open', []);
        await sendFactionInfo(player);
    },
});

// --- админ-команды состава ---

registerCommand('setfaction', {
    guards: [isLoggedIn, isAdmin],
    run: async (player, args) => {
        const [targetArg, rankArg] = args;
        const target = findOnlinePlayer(targetArg);
        if (!target) return player.outputChatBox('!{#FF3333}Игрок не найден или не в сети.');

        const maxRank = factionService.getRanks().length - 1;
        const rank = Math.max(0, Math.min(maxRank, Number(rankArg) || 0));
        const result = await factionService.addMember(1, target.accountId, rank);
        if (!result.success) return player.outputChatBox(`!{#FF3333}Ошибка: ${result.error}`);

        player.outputChatBox(`!{#4CAF50}${target.accountName} зачислен в семью (ранг ${rank}).`);
        target.outputChatBox('!{#4CAF50}Вы зачислены в семью. E на базе — инфо о фракции.');
    },
});

registerCommand('unsetfaction', {
    guards: [isLoggedIn, isAdmin],
    run: async (player, args) => {
        const [targetArg] = args;
        const target = findOnlinePlayer(targetArg);
        if (!target) return player.outputChatBox('!{#FF3333}Игрок не найден или не в сети.');

        const result = await factionService.removeMember(target.accountId);
        if (!result.success) return player.outputChatBox(`!{#FF3333}Ошибка: ${result.error}`);
        player.outputChatBox(`!{#4CAF50}${target.accountName} исключён из семьи.`);
    },
});
