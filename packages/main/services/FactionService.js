const { getFactionModel } = require('../models/Faction');
const { getFactionMemberModel } = require('../models/FactionMember');
const { getSequelize } = require('../core/db');
const moneyService = require('./MoneyService');
const logger = require('../core/logger');

const RANKS = [
    { id: 0, name: 'Шестёрка' },
    { id: 1, name: 'Боец' },
    { id: 2, name: 'Оружейник' },
    { id: 3, name: 'Правая рука' },
    { id: 4, name: 'Босс' },
];

const PERMISSIONS = { invite: 2, kick: 3, withdraw: 4, promote: 4 };

/**
 * FactionService — членство, ранги и касса фракций.
 */
class FactionService {
    getRanks() {
        return RANKS;
    }

    rankName(rank) {
        return (RANKS[rank] || RANKS[0]).name;
    }

    can(member, action) {
        return !!member && member.rank >= (PERMISSIONS[action] ?? 0);
    }

    /** Стартовая фракция, если таблица пуста */
    async ensureSeed() {
        const Faction = getFactionModel();
        if ((await Faction.count()) === 0) {
            await Faction.create({ name: 'Семья Корлеоне', type: 'mafia', treasury: 0 });
            logger.info('[FactionService] Создана стартовая фракция: Семья Корлеоне');
        }
    }

    async getMembership(accountId) {
        const Member = getFactionMemberModel();
        const member = await Member.findOne({ where: { account_id: accountId } });
        if (!member) return null;
        const faction = await getFactionModel().findByPk(member.faction_id);
        if (!faction) return null;
        return { member, faction };
    }

    async getMembers(factionId) {
        return getFactionMemberModel().findAll({
            where: { faction_id: factionId },
            order: [['rank', 'DESC']],
        });
    }

    async addMember(factionId, accountId, rank = 0) {
        if (await this.getMembership(accountId))
            return { success: false, error: 'already_in_faction' };
        await getFactionMemberModel().create({
            faction_id: factionId,
            account_id: accountId,
            rank,
        });
        return { success: true };
    }

    async removeMember(accountId) {
        const removed = await getFactionMemberModel().destroy({ where: { account_id: accountId } });
        return removed ? { success: true } : { success: false, error: 'not_member' };
    }

    async setRank(accountId, rank) {
        const clamped = Math.max(0, Math.min(RANKS.length - 1, Number(rank)));
        const [affected] = await getFactionMemberModel().update(
            { rank: clamped },
            { where: { account_id: accountId } }
        );
        return affected
            ? { success: true, rank: clamped }
            : { success: false, error: 'not_member' };
    }

    /** Взнос в кассу: деньги игрока → касса, атомарно */
    async deposit(player, sum) {
        const amount = Number(sum);
        if (!Number.isInteger(amount) || amount <= 0)
            return { success: false, error: 'invalid_sum' };
        const membership = await this.getMembership(player.accountId);
        if (!membership) return { success: false, error: 'no_faction' };

        const sequelize = getSequelize();
        try {
            await sequelize.transaction(async (t) => {
                const paid = await moneyService.takeMoney(
                    player.accountId,
                    amount,
                    `взнос в кассу ${membership.faction.name}`,
                    t
                );
                if (!paid) throw new Error('not_enough_money');
                await getFactionModel().update(
                    { treasury: sequelize.literal(`treasury + ${amount}`) },
                    { where: { id: membership.faction.id }, transaction: t }
                );
            });
        } catch (err) {
            if (err.message === 'not_enough_money')
                return { success: false, error: 'not_enough_money' };
            throw err;
        }
        player.applyMoneyDelta(-amount);
        logger.info(
            `[FactionService] ${player.accountName} внёс $${amount} в кассу ${membership.faction.name}`
        );
        return { success: true };
    }

    /** Выплата из кассы: только для ранга с правом withdraw */
    async withdraw(player, sum) {
        const amount = Number(sum);
        if (!Number.isInteger(amount) || amount <= 0)
            return { success: false, error: 'invalid_sum' };
        const membership = await this.getMembership(player.accountId);
        if (!membership) return { success: false, error: 'no_faction' };
        if (!this.can(membership.member, 'withdraw'))
            return { success: false, error: 'no_permission' };
        if (membership.faction.treasury < amount) return { success: false, error: 'treasury_poor' };

        const sequelize = getSequelize();
        await sequelize.transaction(async (t) => {
            await getFactionModel().update(
                { treasury: sequelize.literal(`treasury - ${amount}`) },
                { where: { id: membership.faction.id }, transaction: t }
            );
            const paid = await moneyService.addMoney(
                player.accountId,
                amount,
                `выплата из кассы ${membership.faction.name}`,
                t
            );
            if (!paid) throw new Error('payout_failed');
        });
        player.applyMoneyDelta(amount);
        logger.info(
            `[FactionService] ${player.accountName} вывел $${amount} из кассы ${membership.faction.name}`
        );
        return { success: true };
    }
}

module.exports = new FactionService();
