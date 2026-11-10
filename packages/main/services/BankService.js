const { Op, Sequelize } = require('sequelize');
const { randomUUID } = require('crypto');
const { BankConfig, CardPlans, DepositConfig } = require('../config');
const { getBankAccountModel } = require('../models/BankAccount');
const { getBankLedgerModel } = require('../models/BankLedger');
const { getBankDepositModel } = require('../models/BankDeposit');
const { getUserModel } = require('../models/Users');
const moneyService = require('./MoneyService');
const statsService = require('./StatsService');
const logger = require('../core/logger');
const { withLock } = require('../core/asyncLock');

const MAX_SIGNED_INT32 = 2147483647;

function isPositiveMoneyAmount(value) {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_SIGNED_INT32;
}

/**
 * BankService — банковский регистр игрока.
 */
class BankService {
    _validateAmount(amount, maxKey) {
        if (!isPositiveMoneyAmount(amount)) {
            return 'invalid_amount';
        }
        const min = Number.isSafeInteger(BankConfig.minOperation) ? BankConfig.minOperation : 1;
        if (amount < min) {
            return 'invalid_amount';
        }
        const max = BankConfig[maxKey];
        if (Number.isSafeInteger(max) && max > 0 && amount > max) {
            return 'amount_too_large';
        }
        return null;
    }

    _planOf(planId) {
        return CardPlans[planId] || CardPlans[BankConfig.settlement.basePlanId] || CardPlans[1];
    }

    _normalizeAccountRow(row, accountId) {
        if (!row) return null;
        const raw = typeof row.get === 'function' ? row.get({ plain: true }) : row;
        return {
            account_id: Number(raw.account_id ?? accountId),
            balance: Number(raw.balance ?? 0),
            last_accrued_at: raw.last_accrued_at,
            plan_id: Number(raw.plan_id ?? BankConfig.settlement.basePlanId),
            cashback_pending: Number(raw.cashback_pending ?? 0),
        };
    }

    _normalizeDepositRow(row) {
        if (!row) return null;
        const raw = typeof row.get === 'function' ? row.get({ plain: true }) : row;
        return {
            id: Number(raw.id),
            account_id: Number(raw.account_id),
            kind: raw.kind,
            principal: Number(raw.principal ?? 0),
            balance: Number(raw.balance ?? 0),
            rate_per_period: Number(raw.rate_per_period ?? 0),
            period_ms: Number(raw.period_ms ?? 0),
            opened_at: raw.opened_at,
            last_accrued_at: raw.last_accrued_at,
            matures_at: raw.matures_at ?? null,
            status: raw.status || 'active',
            early_penalty_percent: Number(raw.early_penalty_percent ?? 0),
        };
    }

    async _getOrCreateAccount(accountId, transaction) {
        const Model = getBankAccountModel();
        const found = await Model.findByPk(accountId, { transaction, raw: true });
        if (found) return this._normalizeAccountRow(found, accountId);

        const created = await Model.create(
            {
                account_id: accountId,
                balance: 0,
                last_accrued_at: new Date(),
                plan_id: BankConfig.settlement.basePlanId,
                cashback_pending: 0,
            },
            { transaction }
        );
        return this._normalizeAccountRow(created, accountId);
    }

    _periodKey(periodEnd, periodMs) {
        return String(Math.floor(periodEnd / periodMs));
    }

    _depositPeriodKey(depositId, periodEnd, periodMs) {
        return String(Math.floor(periodEnd / periodMs));
    }

    /**
     * Суточный settlement карты.
     * @private
     */
    async _settleCard(accountId, now, transaction) {
        const acc = await this._getOrCreateAccount(accountId, transaction);
        const settlement = BankConfig.settlement;
        const periodMs = Number(settlement.periodMs);

        if (!Number.isFinite(periodMs) || periodMs <= 0) {
            return { accrued: 0, fee: 0, periods: 0, balance: acc.balance, downgraded: false };
        }

        let last = new Date(acc.last_accrued_at).getTime();
        if (!Number.isFinite(last)) last = now;

        let balance = acc.balance;
        let cashbackPending = acc.cashback_pending;
        let planId = acc.plan_id;
        let periods = 0;
        let totalCashback = 0;
        let totalFee = 0;
        let downgraded = false;

        const cashbackCap = Number.isSafeInteger(settlement.cashbackMaxCatchupPeriods)
            ? settlement.cashbackMaxCatchupPeriods
            : 1;
        const feeCap = Number.isSafeInteger(settlement.feeMaxCatchupPeriods)
            ? settlement.feeMaxCatchupPeriods
            : 1;
        const maxPeriods = Math.max(cashbackCap, feeCap);

        const Model = getBankAccountModel();
        const Ledger = getBankLedgerModel();

        while (periods < maxPeriods) {
            const periodEnd = last + periodMs;
            if (periodEnd > now) break;

            const periodKey = this._periodKey(periodEnd, periodMs);

            if (periods < cashbackCap && cashbackPending > 0) {
                const cb = cashbackPending;
                cashbackPending = 0;
                balance += cb;
                totalCashback += cb;

                const [affected] = await Model.update(
                    {
                        balance: Sequelize.literal(`balance + ${cb}`),
                        cashback_pending: 0,
                        last_accrued_at: new Date(periodEnd),
                    },
                    { where: { account_id: accountId }, transaction }
                );
                if (!affected) throw new Error('bank_account_missing');

                await Ledger.create(
                    {
                        account_id: accountId,
                        deposit_id: 0,
                        type: 'cashback',
                        amount: cb,
                        balance_after: balance,
                        period_key: periodKey,
                        reason: 'кэшбэк за траты',
                    },
                    { transaction }
                );
            }

            if (periods < feeCap) {
                const plan = this._planOf(planId);
                const fee =
                    Number.isSafeInteger(plan.dailyFee) && plan.dailyFee > 0 ? plan.dailyFee : 0;

                if (fee > 0) {
                    if (balance >= fee) {
                        balance -= fee;
                        totalFee += fee;

                        const [affected] = await Model.update(
                            {
                                balance: Sequelize.literal(`balance - ${fee}`),
                                last_accrued_at: new Date(periodEnd),
                            },
                            {
                                where: { account_id: accountId, balance: { [Op.gte]: fee } },
                                transaction,
                            }
                        );
                        if (!affected) throw new Error('bank_account_missing');

                        await Ledger.create(
                            {
                                account_id: accountId,
                                deposit_id: 0,
                                type: 'plan_fee',
                                amount: -fee,
                                balance_after: balance,
                                period_key: periodKey,
                                reason: `плата за тариф ${plan.name}`,
                            },
                            { transaction }
                        );
                    } else {
                        const base = this._planOf(BankConfig.settlement.basePlanId);
                        planId = base.id;
                        downgraded = true;

                        const [affected] = await Model.update(
                            {
                                plan_id: base.id,
                                last_accrued_at: new Date(periodEnd),
                            },
                            { where: { account_id: accountId }, transaction }
                        );
                        if (!affected) throw new Error('bank_account_missing');

                        await Ledger.create(
                            {
                                account_id: accountId,
                                deposit_id: 0,
                                type: 'plan_downgrade',
                                amount: 0,
                                balance_after: balance,
                                period_key: periodKey,
                                reason: 'недостаточно средств на плату — тариф понижен до базового',
                            },
                            { transaction }
                        );
                    }
                } else {
                    const [affected] = await Model.update(
                        { last_accrued_at: new Date(periodEnd) },
                        { where: { account_id: accountId }, transaction }
                    );
                    if (!affected) throw new Error('bank_account_missing');
                }
            } else if (periods >= cashbackCap) {
                const [affected] = await Model.update(
                    { last_accrued_at: new Date(periodEnd) },
                    { where: { account_id: accountId }, transaction }
                );
                if (!affected) throw new Error('bank_account_missing');
            }

            last = periodEnd;
            periods += 1;
        }

        return {
            accrued: totalCashback,
            fee: totalFee,
            periods,
            balance,
            downgraded,
            cashbackPending,
            planId,
        };
    }

    async _invalidateEconomy() {
        if (!BankConfig.includeInEconomy) return;
        try {
            await statsService.invalidateEconomyCache();
        } catch (err) {
            logger.warn(`[BankService] не удалось инвалидировать кэш экономики: ${err.message}`);
        }
    }

    /**
     * Публичное ленивое начисление процентов.
     */
    async accrueForAccount(accountId, now = Date.now()) {
        if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            return { success: false, error: 'not_authorized' };
        }
        return withLock(`bank:${accountId}`, async () => {
            const Model = getBankAccountModel();
            const t = await Model.sequelize.transaction();
            try {
                const result = await this._settleCard(accountId, now, t);
                await t.commit();
                if (result.accrued > 0 || result.fee > 0 || result.downgraded) {
                    await this._invalidateEconomy();
                }
                return { success: true, ...result };
            } catch (err) {
                try {
                    await t.rollback();
                } catch {}
                logger.error(`[BankService] accrueForAccount ${accountId}: ${err.message}`);
                return { success: false, error: 'db_error' };
            }
        });
    }

    async getInfo(accountId, now = Date.now()) {
        const Model = getBankAccountModel();
        const row = await Model.findByPk(accountId, { raw: true });
        const acc = this._normalizeAccountRow(row, accountId) || {
            account_id: accountId,
            balance: 0,
            last_accrued_at: new Date(now),
            plan_id: BankConfig.settlement.basePlanId,
            cashback_pending: 0,
        };

        const settlement = BankConfig.settlement;
        const periodMs = Number(settlement.periodMs);
        const last = new Date(acc.last_accrued_at).getTime();
        const enabled = Number.isFinite(periodMs) && periodMs > 0;

        const pendingPeriods =
            enabled && Number.isFinite(last)
                ? Math.min(
                      Math.max(0, Math.floor((now - last) / periodMs)),
                      Math.max(
                          Number.isSafeInteger(settlement.cashbackMaxCatchupPeriods)
                              ? settlement.cashbackMaxCatchupPeriods
                              : 0,
                          Number.isSafeInteger(settlement.feeMaxCatchupPeriods)
                              ? settlement.feeMaxCatchupPeriods
                              : 0
                      )
                  )
                : 0;

        const plan = this._planOf(acc.plan_id);

        return {
            exists: !!row,
            balance: acc.balance,
            cashbackPending: acc.cashback_pending,
            plan: {
                id: plan.id,
                name: plan.name,
                dailyFee: plan.dailyFee,
                cashbackPercent: plan.cashbackPercent,
                transferDailyLimit: plan.transferDailyLimit,
                withdrawFreeDailyLimit: plan.withdrawFreeDailyLimit,
                overTransferFeePercent: plan.overTransferFeePercent,
                overWithdrawFeePercent: plan.overWithdrawFeePercent,
            },
            lastSettledAt: Number.isFinite(last) ? last : null,
            nextSettlementAt: enabled && Number.isFinite(last) ? last + periodMs : null,
            pendingSettlementPeriods: pendingPeriods,
        };
    }

    async setPlan(player, planId) {
        const accountId = player?.accountId;
        if (!accountId) return { success: false, error: 'not_authorized' };

        const target = CardPlans[Number(planId)];
        if (!target) return { success: false, error: 'unknown_plan' };

        return withLock(`bank:${accountId}`, async () => {
            const Model = getBankAccountModel();
            const t = await Model.sequelize.transaction();
            try {
                const acc = await this._getOrCreateAccount(accountId, t);
                if (acc.plan_id === target.id) {
                    await t.rollback();
                    return { success: true, plan: target, unchanged: true };
                }

                const [affected] = await Model.update(
                    { plan_id: target.id },
                    { where: { account_id: accountId }, transaction: t }
                );
                if (!affected) {
                    await t.rollback();
                    return { success: false, error: 'account_not_found' };
                }

                await getBankLedgerModel().create(
                    {
                        account_id: accountId,
                        deposit_id: 0,
                        type: 'plan_change',
                        amount: 0,
                        balance_after: acc.balance,
                        reason: `смена тарифа на ${target.name}`,
                    },
                    { transaction: t }
                );

                await t.commit();
                await this._invalidateEconomy();
                logger.info(
                    `[BankService] ${player.accountName || accountId} сменил тариф на ${target.name}`
                );
                return { success: true, plan: target };
            } catch (err) {
                try {
                    await t.rollback();
                } catch {}
                logger.error(`[BankService] setPlan ${accountId}: ${err.message}`);
                return { success: false, error: 'db_error' };
            }
        });
    }

    async deposit(player, amount) {
        const accountId = player?.accountId;
        if (!accountId) return { success: false, error: 'not_authorized' };

        const invalid = this._validateAmount(amount, 'maxDeposit');
        if (invalid) return { success: false, error: invalid };

        return withLock(`bank:${accountId}`, async () => {
            const Model = getBankAccountModel();
            const t = await Model.sequelize.transaction();
            try {
                const settle = await this._settleCard(accountId, Date.now(), t);
                const newBalance = settle.balance + amount;

                if (
                    Number.isSafeInteger(BankConfig.maxBalance) &&
                    BankConfig.maxBalance > 0 &&
                    newBalance > BankConfig.maxBalance
                ) {
                    await t.rollback();
                    return { success: false, error: 'amount_too_large' };
                }

                const paid = await moneyService.takeMoney(accountId, amount, 'пополнение карты', t);
                if (!paid) {
                    await t.rollback();
                    return { success: false, error: 'not_enough_money' };
                }

                const [affected] = await Model.update(
                    { balance: Sequelize.literal(`balance + ${amount}`) },
                    { where: { account_id: accountId }, transaction: t }
                );
                if (!affected) {
                    await t.rollback();
                    return { success: false, error: 'account_not_found' };
                }

                await getBankLedgerModel().create(
                    {
                        account_id: accountId,
                        deposit_id: 0,
                        type: 'deposit',
                        amount,
                        balance_after: newBalance,
                        reason: 'пополнение карты',
                    },
                    { transaction: t }
                );

                await t.commit();
                if (typeof player.applyMoneyDelta === 'function') player.applyMoneyDelta(-amount);
                await this._invalidateEconomy();
                logger.info(
                    `[BankService] ${player.accountName || accountId} пополнил карту на $${amount}`
                );
                return { success: true, balance: newBalance, settled: settle };
            } catch (err) {
                try {
                    await t.rollback();
                } catch {}
                logger.error(`[BankService] deposit ${accountId}: ${err.message}`);
                return { success: false, error: 'db_error' };
            }
        });
    }

    async withdraw(player, amount) {
        const accountId = player?.accountId;
        if (!accountId) return { success: false, error: 'not_authorized' };

        const invalid = this._validateAmount(amount, 'maxWithdraw');
        if (invalid) return { success: false, error: invalid };

        return withLock(`bank:${accountId}`, async () => {
            const Model = getBankAccountModel();
            const t = await Model.sequelize.transaction();
            try {
                const settle = await this._settleCard(accountId, Date.now(), t);
                if (settle.balance < amount) {
                    await t.rollback();
                    return { success: false, error: 'not_enough_bank_money' };
                }
                const newBalance = settle.balance - amount;

                const [affected] = await Model.update(
                    { balance: Sequelize.literal(`balance - ${amount}`) },
                    {
                        where: { account_id: accountId, balance: { [Op.gte]: amount } },
                        transaction: t,
                    }
                );
                if (!affected) {
                    await t.rollback();
                    return { success: false, error: 'not_enough_bank_money' };
                }

                const added = await moneyService.addMoney(accountId, amount, 'снятие с карты', t);
                if (!added) {
                    await t.rollback();
                    return { success: false, error: 'db_error' };
                }

                await getBankLedgerModel().create(
                    {
                        account_id: accountId,
                        deposit_id: 0,
                        type: 'withdraw',
                        amount: -amount,
                        balance_after: newBalance,
                        reason: 'снятие с карты',
                    },
                    { transaction: t }
                );

                await t.commit();
                if (typeof player.applyMoneyDelta === 'function') player.applyMoneyDelta(amount);
                await this._invalidateEconomy();
                logger.info(
                    `[BankService] ${player.accountName || accountId} снял с карты $${amount}`
                );
                return { success: true, balance: newBalance, settled: settle };
            } catch (err) {
                try {
                    await t.rollback();
                } catch {}
                logger.error(`[BankService] withdraw ${accountId}: ${err.message}`);
                return { success: false, error: 'db_error' };
            }
        });
    }

    async transfer(actor, toAccountId, amount) {
        const fromId = actor?.accountId;
        const toId = Number(toAccountId);
        if (!fromId || !Number.isSafeInteger(toId) || toId <= 0) {
            return { success: false, error: 'not_authorized' };
        }
        if (fromId === toId) return { success: false, error: 'self_transfer' };

        const invalid = this._validateAmount(amount, 'maxTransfer');
        if (invalid) return { success: false, error: invalid };

        const first = Math.min(fromId, toId);
        const second = Math.max(fromId, toId);

        return withLock(`bank:${first}`, async () =>
            withLock(`bank:${second}`, async () => {
                const Model = getBankAccountModel();
                const t = await Model.sequelize.transaction();
                try {
                    const recipient = await getUserModel().findByPk(toId, {
                        transaction: t,
                        raw: true,
                        attributes: ['id'],
                    });
                    if (!recipient) {
                        await t.rollback();
                        return { success: false, error: 'recipient_not_found' };
                    }

                    const fromSettle = await this._settleCard(fromId, Date.now(), t);
                    const toSettle = await this._settleCard(toId, Date.now(), t);

                    const fromNewBalance = fromSettle.balance - amount;
                    const toNewBalance = toSettle.balance + amount;

                    if (
                        Number.isSafeInteger(BankConfig.maxBalance) &&
                        BankConfig.maxBalance > 0 &&
                        toNewBalance > BankConfig.maxBalance
                    ) {
                        await t.rollback();
                        return { success: false, error: 'amount_too_large' };
                    }

                    const [sent] = await Model.update(
                        { balance: Sequelize.literal(`balance - ${amount}`) },
                        {
                            where: { account_id: fromId, balance: { [Op.gte]: amount } },
                            transaction: t,
                        }
                    );
                    if (!sent) {
                        await t.rollback();
                        return { success: false, error: 'not_enough_bank_money' };
                    }

                    const [received] = await Model.update(
                        { balance: Sequelize.literal(`balance + ${amount}`) },
                        { where: { account_id: toId }, transaction: t }
                    );
                    if (!received) {
                        await t.rollback();
                        return { success: false, error: 'account_not_found' };
                    }

                    const referenceId = randomUUID();
                    const Ledger = getBankLedgerModel();

                    await Ledger.create(
                        {
                            account_id: fromId,
                            deposit_id: 0,
                            type: 'transfer_out',
                            amount: -amount,
                            balance_after: fromNewBalance,
                            reference_id: referenceId,
                            reason: `перевод на счёт ${toId}`,
                        },
                        { transaction: t }
                    );
                    await Ledger.create(
                        {
                            account_id: toId,
                            deposit_id: 0,
                            type: 'transfer_in',
                            amount,
                            balance_after: toNewBalance,
                            reference_id: referenceId,
                            reason: `перевод со счёта ${fromId}`,
                        },
                        { transaction: t }
                    );

                    await t.commit();
                    await this._invalidateEconomy();
                    logger.info(
                        `[BankService] ${actor.accountName || fromId} перевёл $${amount} на карту ${toId}`
                    );
                    return {
                        success: true,
                        referenceId,
                        fromBalance: fromNewBalance,
                        toBalance: toNewBalance,
                    };
                } catch (err) {
                    try {
                        await t.rollback();
                    } catch {}
                    logger.error(`[BankService] transfer ${fromId} -> ${toId}: ${err.message}`);
                    return { success: false, error: 'db_error' };
                }
            })
        );
    }

    async _accrueDeposit(deposit, now, transaction) {
        if (deposit.status !== 'active') {
            return { accrued: 0, periods: 0, balance: deposit.balance };
        }

        const periodMs = deposit.period_ms;
        if (!Number.isFinite(periodMs) || periodMs <= 0) {
            return { accrued: 0, periods: 0, balance: deposit.balance };
        }

        let last = new Date(deposit.last_accrued_at).getTime();
        if (!Number.isFinite(last)) last = now;

        let end = now;
        if (deposit.kind === 'frozen' && deposit.matures_at) {
            const matures = new Date(deposit.matures_at).getTime();
            if (Number.isFinite(matures)) end = Math.min(now, matures);
        }

        const cfg = deposit.kind === 'frozen' ? DepositConfig.frozen : DepositConfig.flexible;
        const cap =
            Number.isSafeInteger(cfg.maxCatchupPeriods) && cfg.maxCatchupPeriods > 0
                ? cfg.maxCatchupPeriods
                : 1;

        let balance = deposit.balance;
        let accrued = 0;
        let periods = 0;

        const Model = getBankDepositModel();
        const Ledger = getBankLedgerModel();

        while (periods < cap) {
            const periodEnd = last + periodMs;
            if (periodEnd > end) break;

            const interest = Math.floor(balance * deposit.rate_per_period);
            balance += interest;
            accrued += interest;
            last = periodEnd;
            periods += 1;

            const [affected] = await Model.update(
                {
                    balance: Sequelize.literal(`balance + ${interest}`),
                    last_accrued_at: new Date(periodEnd),
                },
                { where: { id: deposit.id }, transaction }
            );
            if (!affected) throw new Error('bank_deposit_missing');

            if (interest > 0) {
                await Ledger.create(
                    {
                        account_id: deposit.account_id,
                        deposit_id: deposit.id,
                        type: 'deposit_interest',
                        amount: interest,
                        balance_after: balance,
                        period_key: this._depositPeriodKey(deposit.id, periodEnd, periodMs),
                        reason: 'процент по вкладу',
                    },
                    { transaction }
                );
            }
        }

        return { accrued, periods, balance };
    }

    async createDeposit(player, kind, amount, tierDays, now = Date.now()) {
        const accountId = player?.accountId;
        if (!accountId) return { success: false, error: 'not_authorized' };

        if (kind !== 'flexible' && kind !== 'frozen') {
            return { success: false, error: 'invalid_kind' };
        }
        if (!isPositiveMoneyAmount(amount)) {
            return { success: false, error: 'invalid_amount' };
        }

        const cfg = kind === 'frozen' ? DepositConfig.frozen : DepositConfig.flexible;
        if (amount < cfg.minPrincipal) {
            return { success: false, error: 'min_principal' };
        }

        let ratePerPeriod;
        let periodMs;
        let maturesAt = null;
        let earlyPenalty = 0;

        if (kind === 'flexible') {
            ratePerPeriod = cfg.ratePerHour;
            periodMs = cfg.periodMs;
        } else {
            const tier = (cfg.tiers || []).find((x) => x.days === Number(tierDays));
            if (!tier) return { success: false, error: 'unknown_tier' };
            ratePerPeriod = tier.ratePerDay;
            periodMs = 24 * 60 * 60 * 1000;
            maturesAt = new Date(now + tier.days * periodMs);
            earlyPenalty = cfg.earlyPenaltyPercent;
        }

        return withLock(`bank:${accountId}`, async () =>
            withLock(`bank:deposits:${accountId}`, async () => {
                const AccountModel = getBankAccountModel();
                const DepositModel = getBankDepositModel();
                const t = await AccountModel.sequelize.transaction();
                try {
                    const activeCount = await DepositModel.count({
                        where: { account_id: accountId, status: 'active' },
                        transaction: t,
                    });
                    if (activeCount >= DepositConfig.maxActiveDeposits) {
                        await t.rollback();
                        return { success: false, error: 'too_many_deposits' };
                    }

                    const acc = await this._getOrCreateAccount(accountId, t);
                    if (acc.balance < amount) {
                        await t.rollback();
                        return { success: false, error: 'not_enough_bank_money' };
                    }

                    const newCardBalance = acc.balance - amount;

                    const [cardAffected] = await AccountModel.update(
                        { balance: Sequelize.literal(`balance - ${amount}`) },
                        {
                            where: { account_id: accountId, balance: { [Op.gte]: amount } },
                            transaction: t,
                        }
                    );
                    if (!cardAffected) {
                        await t.rollback();
                        return { success: false, error: 'not_enough_bank_money' };
                    }

                    const created = await DepositModel.create(
                        {
                            account_id: accountId,
                            kind,
                            principal: amount,
                            balance: amount,
                            rate_per_period: ratePerPeriod,
                            period_ms: periodMs,
                            matures_at: maturesAt,
                            status: 'active',
                            early_penalty_percent: earlyPenalty,
                            opened_at: new Date(now),
                            last_accrued_at: new Date(now),
                        },
                        { transaction: t }
                    );

                    const Ledger = getBankLedgerModel();
                    await Ledger.create(
                        {
                            account_id: accountId,
                            deposit_id: 0,
                            type: 'deposit_fund',
                            amount: -amount,
                            balance_after: newCardBalance,
                            reason: `открытие вклада (${kind})`,
                        },
                        { transaction: t }
                    );
                    await Ledger.create(
                        {
                            account_id: accountId,
                            deposit_id: created.id,
                            type: 'deposit_open',
                            amount,
                            balance_after: amount,
                            reason: `открытие вклада (${kind})`,
                        },
                        { transaction: t }
                    );

                    await t.commit();
                    await this._invalidateEconomy();
                    logger.info(
                        `[BankService] ${player.accountName || accountId} открыл вклад ${kind} на $${amount}`
                    );
                    return {
                        success: true,
                        deposit: this._normalizeDepositRow(created),
                        cardBalance: newCardBalance,
                    };
                } catch (err) {
                    try {
                        await t.rollback();
                    } catch {}
                    logger.error(`[BankService] createDeposit ${accountId}: ${err.message}`);
                    return { success: false, error: 'db_error' };
                }
            })
        );
    }

    async closeDeposit(player, depositId, early = false, now = Date.now()) {
        const accountId = player?.accountId;
        const id = Number(depositId);
        if (!accountId || !Number.isSafeInteger(id) || id <= 0) {
            return { success: false, error: 'not_authorized' };
        }

        return withLock(`bank:${accountId}`, async () =>
            withLock(`bank:deposit:${id}`, async () => {
                const AccountModel = getBankAccountModel();
                const DepositModel = getBankDepositModel();
                const t = await AccountModel.sequelize.transaction();
                try {
                    const depRow = await DepositModel.findByPk(id, { transaction: t, raw: true });
                    const dep = this._normalizeDepositRow(depRow);
                    if (!dep) {
                        await t.rollback();
                        return { success: false, error: 'deposit_not_found' };
                    }
                    if (dep.account_id !== accountId) {
                        await t.rollback();
                        return { success: false, error: 'not_owner' };
                    }
                    if (dep.status !== 'active') {
                        await t.rollback();
                        return { success: false, error: 'deposit_closed' };
                    }

                    const accr = await this._accrueDeposit(dep, now, t);
                    let balance = accr.balance;

                    const matures = dep.matures_at ? new Date(dep.matures_at).getTime() : null;
                    const isEarly =
                        dep.kind === 'frozen' &&
                        Number.isFinite(matures) &&
                        now < matures &&
                        early === true;

                    let penalty = 0;
                    if (isEarly) {
                        const earned = Math.max(0, balance - dep.principal);
                        penalty = Math.floor(earned * dep.early_penalty_percent);
                    }

                    const payout = balance - penalty;
                    const newCardBalance =
                        (await this._getOrCreateAccount(accountId, t)).balance + payout;

                    const [depAffected] = await DepositModel.update(
                        { status: 'closed', balance: 0, last_accrued_at: new Date(now) },
                        { where: { id, status: 'active' }, transaction: t }
                    );
                    if (!depAffected) {
                        await t.rollback();
                        return { success: false, error: 'deposit_closed' };
                    }

                    const [cardAffected] = await AccountModel.update(
                        { balance: Sequelize.literal(`balance + ${payout}`) },
                        { where: { account_id: accountId }, transaction: t }
                    );
                    if (!cardAffected) {
                        await t.rollback();
                        return { success: false, error: 'account_not_found' };
                    }

                    const Ledger = getBankLedgerModel();
                    await Ledger.create(
                        {
                            account_id: accountId,
                            deposit_id: id,
                            type: 'deposit_close',
                            amount: -payout,
                            balance_after: 0,
                            reason: isEarly ? 'досрочное закрытие вклада' : 'закрытие вклада',
                        },
                        { transaction: t }
                    );
                    if (penalty > 0) {
                        await Ledger.create(
                            {
                                account_id: accountId,
                                deposit_id: id,
                                type: 'deposit_penalty',
                                amount: -penalty,
                                balance_after: 0,
                                reason: 'штраф за досрочное закрытие',
                            },
                            { transaction: t }
                        );
                    }
                    await Ledger.create(
                        {
                            account_id: accountId,
                            deposit_id: 0,
                            type: 'deposit_payout',
                            amount: payout,
                            balance_after: newCardBalance,
                            reason: `закрытие вклада #${id}`,
                        },
                        { transaction: t }
                    );

                    await t.commit();
                    await this._invalidateEconomy();
                    logger.info(
                        `[BankService] ${player.accountName || accountId} закрыл вклад #${id}, payout $${payout}, penalty $${penalty}`
                    );
                    return { success: true, payout, penalty, cardBalance: newCardBalance };
                } catch (err) {
                    try {
                        await t.rollback();
                    } catch {}
                    logger.error(`[BankService] closeDeposit ${id}: ${err.message}`);
                    return { success: false, error: 'db_error' };
                }
            })
        );
    }

    async getDeposits(accountId, now = Date.now()) {
        const DepositModel = getBankDepositModel();
        const rows = await DepositModel.findAll({
            where: { account_id: accountId },
            order: [['opened_at', 'DESC']],
            raw: true,
        });

        const result = [];
        for (const r of rows) {
            const dep = this._normalizeDepositRow(r);
            if (!dep) continue;

            if (dep.status === 'active' && dep.kind === 'frozen' && dep.matures_at) {
                const matures = new Date(dep.matures_at).getTime();
                if (Number.isFinite(matures) && now >= matures) {
                    const closed = await this.closeDeposit(
                        { accountId, accountName: null },
                        dep.id,
                        false,
                        now
                    );
                    if (closed.success) {
                        result.push({
                            ...dep,
                            status: 'closed',
                            balance: 0,
                            maturedAuto: true,
                            payout: closed.payout,
                        });
                        continue;
                    }
                }
            }
            result.push(dep);
        }
        return result;
    }

    async getStatement(accountId, fromMs, toMs, now = Date.now()) {
        const Ledger = getBankLedgerModel();
        const from = new Date(Number(fromMs) || now - 24 * 60 * 60 * 1000);
        const to = new Date(Number(toMs) || now);

        const rows = await Ledger.findAll({
            where: {
                account_id: accountId,
                deposit_id: 0,
                created_at: { [Op.between]: [from, to] },
            },
            order: [['created_at', 'ASC']],
            raw: true,
        });

        const acc = await getBankAccountModel().findByPk(accountId, { raw: true });
        const currentBalance = Number(acc?.balance ?? 0);

        const turnover = rows.reduce((sum, r) => sum + Number(r.amount), 0);
        const openingBalance = currentBalance - turnover;

        return {
            from: from.toISOString(),
            to: to.toISOString(),
            openingBalance,
            closingBalance: currentBalance,
            turnover,
            operations: rows.map((r) => ({
                id: r.id,
                type: r.type,
                amount: Number(r.amount),
                balanceAfter: Number(r.balance_after),
                reason: r.reason || null,
                createdAt: r.created_at,
            })),
        };
    }

    async getLedger(accountId, limit = 20, depositId = null) {
        const per = Math.max(1, Math.min(Number(limit) || 20, 100));
        const where = { account_id: accountId };
        if (depositId !== null) where.deposit_id = depositId;
        else where.deposit_id = 0;

        const rows = await getBankLedgerModel().findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: per,
            raw: true,
        });

        return rows.map((r) => ({
            id: r.id,
            depositId: Number(r.deposit_id ?? 0),
            type: r.type,
            amount: Number(r.amount),
            balanceAfter: Number(r.balance_after),
            referenceId: r.reference_id || null,
            periodKey: r.period_key || null,
            reason: r.reason || null,
            createdAt: r.created_at,
        }));
    }
}

module.exports = new BankService();
