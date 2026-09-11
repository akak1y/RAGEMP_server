const factionService = require('../services/FactionService');
const auditService = require('../services/AuditService');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { registerCommand } = require('./commandSystem');
const { sendEvent } = require('../core/eventSender');

/**
 * Фракции: инфо для UI, касса, управление составом, открытие окна.
 */

const adminOnly = isAdmin(1);

const ERROR_TEXT = {
    no_faction: 'Вы не состоите в семье',
    no_permission: 'Недостаточно прав для этого действия',
    already_in_faction: 'Игрок уже состоит в семье',
    not_member: 'Игрок не состоит в семье',
    rank_too_high: 'Цель равна или выше вас по рангу',
    rank_limit: 'Достигнут предел ранга',
};

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

/**
 * обновить окно всем онлайн-участникам фракции
 */
async function refreshOnlineMembers(factionId) {
    const members = await factionService.getMembers(factionId);
    const ids = new Set(members.map((m) => m.account_id));
    for (const p of mp.players.toArray()) {
        if (p.isLoggedIn && ids.has(p.accountId)) await sendFactionInfo(p);
    }
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

// --- управление составом ---

mp.events.add(
    'server:faction:invite',
    withGuards(
        [isLoggedIn, rateLimit('faction:invite', 3, 15)],
        async (player, targetArg) => {
            const target = findOnlinePlayer(String(targetArg ?? ''));
            if (!target)
                return sendEvent(player, 'client:faction:memberResult', [
                    false,
                    'Игрок не найден или не в сети',
                ]);
            if (target.accountId === player.accountId)
                return sendEvent(player, 'client:faction:memberResult', [
                    false,
                    'Нельзя пригласить себя',
                ]);
            const result = await factionService.invite(player, target.accountId);
            if (!result.success)
                return sendEvent(player, 'client:faction:memberResult', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            const membership = await factionService.getMembership(player.accountId);
            auditService.logPlayer(player, 'faction_invite', {
                category: 'faction',
                target: target.accountId,
                details: { target_name: target.accountName },
            });
            target.outputChatBox(
                `!{#4CAF50}[Семья] Вы приняты в семью ${membership.faction.name}. E на базе — окно семьи.`
            );
            sendEvent(player, 'client:faction:memberResult', [
                true,
                `${target.accountName} принят в семью`,
            ]);
            await refreshOnlineMembers(membership.faction.id);
        },
        'faction:invite'
    )
);

mp.events.add(
    'server:faction:kick',
    withGuards(
        [isLoggedIn, rateLimit('faction:kick', 3, 15)],
        async (player, targetId) => {
            const id = Number(targetId);
            const result = await factionService.kick(player, id);
            if (!result.success)
                return sendEvent(player, 'client:faction:memberResult', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            auditService.logPlayer(player, 'faction_kick', { category: 'faction', target: id });
            const target = mp.players.toArray().find((p) => p.accountId === id);
            if (target) {
                target.outputChatBox('!{#FF3333}[Семья] Вы исключены из семьи.');
                await sendFactionInfo(target);
            }
            sendEvent(player, 'client:faction:memberResult', [true, 'Игрок исключён из семьи']);
            const membership = await factionService.getMembership(player.accountId);
            if (membership) await refreshOnlineMembers(membership.faction.id);
        },
        'faction:kick'
    )
);

function rankChangeEvent(delta, actionName, okText) {
    return withGuards(
        [isLoggedIn, rateLimit(`faction:${actionName}`, 3, 15)],
        async (player, targetId) => {
            const id = Number(targetId);
            const result = await factionService.changeRank(player, id, delta);
            if (!result.success)
                return sendEvent(player, 'client:faction:memberResult', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            auditService.logPlayer(player, `faction_${actionName}`, {
                category: 'faction',
                target: id,
                details: { new_rank: result.rank },
            });
            sendEvent(player, 'client:faction:memberResult', [true, okText]);
            const membership = await factionService.getMembership(player.accountId);
            if (membership) await refreshOnlineMembers(membership.faction.id);
        },
        `faction:${actionName}`
    );
}

mp.events.add('server:faction:promote', rankChangeEvent(1, 'promote', 'Ранг повышен'));
mp.events.add('server:faction:demote', rankChangeEvent(-1, 'demote', 'Ранг понижен'));

// --- админ-команда открытия окна ---
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
