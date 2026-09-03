const factionService = require('../services/FactionService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');

/**
 * Фракции: инфо для UI, касса (взнос/вывод).
 */

mp.events.add(
    'server:faction:requestInfo',
    withGuards(
        [isLoggedIn],
        async (player) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership) return player.call('client:faction:setInfo', ['null']);

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
