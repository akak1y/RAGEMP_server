const factionService = require('../services/FactionService');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { registerCommand } = require('./commandSystem');

/**
 * Фракции: инфо для UI, касса (взнос/вывод).
 */

function findOnlinePlayer(arg) {
    if (!arg) return null;
    const list = mp.players.toArray().filter((p) => p.isLoggedIn);
    if (/^\d+$/.test(arg)) return list.find((p) => p.accountId === Number(arg));
    return list.find((p) => (p.accountName || '').toLowerCase() === String(arg).toLowerCase());
}

mp.events.add(
    'server:faction:requestInfo',
    withGuards(
        [isLoggedIn],
        async (player) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership) {
                player.outputChatBox('!{#FF3333}[Фракция] Вы не состоите во фракции.');
                return player.call('client:faction:setInfo', ['null']);
            }
            const members = await factionService.getMembers(membership.faction.id);
            player.call('client:faction:setInfo', [
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
        },
        'faction:requestInfo'
    )
);

mp.events.add(
    'server:faction:deposit',
    withGuards(
        [isLoggedIn, rateLimit('faction:deposit', 3, 10)],
        async (player, sum) => {
            const result = await factionService.deposit(player, sum);
            player.call('client:faction:moneyResult', [result.success, result.error || 'deposit']);
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
            player.call('client:faction:moneyResult', [result.success, result.error || 'withdraw']);
        },
        'faction:withdraw'
    )
);

// --- админ-команды ---

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
