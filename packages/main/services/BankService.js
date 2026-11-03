const { Op, Sequelize } = require('sequelize');
const { randomUUID } = require('crypto');
const { BankConfig } = require('../config');
const { getBankAccountModel } = require('../models/BankAccount');
const { getBankLedgerModel } = require('../models/BankLedger');
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

    _normalizeAccountRow(row, accountId) {
        if (!row) return null;

        const raw = typeof row.get === 'function' ? row.get({ plain: true }) : row;

        return {
            account_id: Number(raw.account_id ?? accountId),
            balance: Number(raw.balance ?? 0),
            last_accrued_at: raw.last_accrued_at,
        };
    }

    async _getOrCreateAccount(accountId, transaction) {
        const Model = getBankAccountModel();

        const found = await Model.findByPk(accountId, {
            transaction,
            raw: true,
        });

        if (found) {
            return this._normalizeAccountRow(found, accountId);
        }

        const created = await Model.create(
            {
                account_id: accountId,
                balance: 0,
                last_accrued_at: new Date(),
            },
            { transaction }
        );

        return this._normalizeAccountRow(created, accountId);
    }

    _periodKey(periodEnd) {
        const periodMs = Number(BankConfig?.interest?.periodMs);
        return String(Math.floor(periodEnd / periodMs));
    }

    /**
     * Внутреннее начисление процентов.
     * @private
     */
    async _accrueInterest(accountId, now, transaction) {
        const acc = await this._getOrCreateAccount(accountId, transaction);
        const interest = BankConfig.interest;

        if (!interest?.enabled) {
            return { accrued: 0, periods: 0, balance: acc.balance };
        }

        const periodMs = Number(interest.periodMs);
        if (!Number.isFinite(periodMs) || periodMs <= 0) {
            return { accrued: 0, periods: 0, balance: acc.balance };
        }

        let last = new Date(acc.last_accrued_at).getTime();
        if (!Number.isFinite(last)) {
            last = now;
        }

        let balance = Number(acc.balance) || 0;
        let accrued = 0;
        let periods = 0;

        const maxPeriods =
            Number.isSafeInteger(interest.maxCatchupPeriods) && interest.maxCatchupPeriods > 0
                ? interest.maxCatchupPeriods
                : 1;

        const minBalance = Number.isFinite(interest.minBalance) ? interest.minBalance : 0;
        const rate = Number.isFinite(interest.ratePerPeriod) ? interest.ratePerPeriod : 0;

        const maxBalance =
            Number.isSafeInteger(BankConfig.maxBalance) && BankConfig.maxBalance > 0
                ? BankConfig.maxBalance
                : null;

        while (periods < maxPeriods) {
            const periodEnd = last + periodMs;
            if (periodEnd > now) break;

            let interestAmount = 0;

            if (balance >= minBalance && rate > 0) {
                interestAmount = Math.floor(balance * rate);

                if (maxBalance !== null) {
                    interestAmount = Math.min(interestAmount, Math.max(0, maxBalance - balance));
                }
            }

            last = periodEnd;
            periods += 1;

            const Model = getBankAccountModel();

            if (interestAmount > 0) {
                balance += interestAmount;

                const [affected] = await Model.update(
                    {
                        balance: Sequelize.literal(`balance + ${interestAmount}`),
                        last_accrued_at: new Date(last),
                    },
                    {
                        where: { account_id: accountId },
                        transaction,
                    }
                );

                if (!affected) {
                    throw new Error('bank_account_missing');
                }

                await getBankLedgerModel().create(
                    {
                        account_id: accountId,
                        type: 'interest',
                        amount: interestAmount,
                        balance_after: balance,
                        period_key: this._periodKey(last),
                        reason: 'процент по вкладу',
                    },
                    { transaction }
                );

                accrued += interestAmount;
            } else {
                const [affected] = await Model.update(
                    {
                        last_accrued_at: new Date(last),
                    },
                    {
                        where: { account_id: accountId },
                        transaction,
                    }
                );

                if (!affected) {
                    throw new Error('bank_account_missing');
                }
            }
        }

        return { accrued, periods, balance };
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
                const result = await this._accrueInterest(accountId, now, t);
                await t.commit();

                if (result.accrued > 0) {
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

    /**
     * Информационный снимок для UI.
     */
    async getInfo(accountId, now = Date.now()) {
        const Model = getBankAccountModel();
        const row = await Model.findByPk(accountId, { raw: true });

        const acc = this._normalizeAccountRow(row, accountId) || {
            account_id: accountId,
            balance: 0,
            last_accrued_at: new Date(now),
        };

        const interest = BankConfig.interest;
        const periodMs = Number(interest?.periodMs);
        const last = new Date(acc.last_accrued_at).getTime();

        const enabled = !!interest?.enabled && Number.isFinite(periodMs) && periodMs > 0;

        const pendingPeriods =
            enabled && Number.isFinite(last)
                ? Math.min(
                      Math.max(0, Math.floor((now - last) / periodMs)),
                      Number.isSafeInteger(interest.maxCatchupPeriods)
                          ? interest.maxCatchupPeriods
                          : 0
                  )
                : 0;

        const estimatedNextInterest =
            enabled && acc.balance >= (interest.minBalance || 0)
                ? Math.floor(acc.balance * (interest.ratePerPeriod || 0))
                : 0;

        return {
            exists: !!row,
            balance: acc.balance,
            lastAccruedAt: Number.isFinite(last) ? last : null,
            nextInterestAt: enabled && Number.isFinite(last) ? last + periodMs : null,
            pendingPeriods,
            estimatedNextInterest,
        };
    }

    /**
     * Пополнение банка: наличные → банковский счёт.
     */
    async deposit(player, amount) {
        const accountId = player?.accountId;

        if (!accountId) {
            return { success: false, error: 'not_authorized' };
        }

        const invalid = this._validateAmount(amount, 'maxDeposit');
        if (invalid) {
            return { success: false, error: invalid };
        }

        return withLock(`bank:${accountId}`, async () => {
            const Model = getBankAccountModel();
            const t = await Model.sequelize.transaction();

            try {
                const accr = await this._accrueInterest(accountId, Date.now(), t);
                const newBalance = accr.balance + amount;

                if (
                    Number.isSafeInteger(BankConfig.maxBalance) &&
                    BankConfig.maxBalance > 0 &&
                    newBalance > BankConfig.maxBalance
                ) {
                    await t.rollback();
                    return { success: false, error: 'amount_too_large' };
                }

                const paid = await moneyService.takeMoney(accountId, amount, 'пополнение банка', t);

                if (!paid) {
                    await t.rollback();
                    return { success: false, error: 'not_enough_money' };
                }

                const [affected] = await Model.update(
                    {
                        balance: Sequelize.literal(`balance + ${amount}`),
                    },
                    {
                        where: { account_id: accountId },
                        transaction: t,
                    }
                );

                if (!affected) {
                    await t.rollback();
                    return { success: false, error: 'account_not_found' };
                }

                await getBankLedgerModel().create(
                    {
                        account_id: accountId,
                        type: 'deposit',
                        amount,
                        balance_after: newBalance,
                        reason: 'пополнение банка',
                    },
                    { transaction: t }
                );

                await t.commit();

                if (typeof player.applyMoneyDelta === 'function') {
                    player.applyMoneyDelta(-amount);
                }

                await this._invalidateEconomy();

                logger.info(
                    `[BankService] ${player.accountName || accountId} положил в банк $${amount}`
                );

                return {
                    success: true,
                    balance: newBalance,
                    accrued: accr.accrued,
                };
            } catch (err) {
                try {
                    await t.rollback();
                } catch {}

                logger.error(`[BankService] deposit ${accountId}: ${err.message}`);
                return { success: false, error: 'db_error' };
            }
        });
    }

    /**
     * Снятие из банка: банковский счёт → наличные.
     */
    async withdraw(player, amount) {
        const accountId = player?.accountId;

        if (!accountId) {
            return { success: false, error: 'not_authorized' };
        }

        const invalid = this._validateAmount(amount, 'maxWithdraw');
        if (invalid) {
            return { success: false, error: invalid };
        }

        return withLock(`bank:${accountId}`, async () => {
            const Model = getBankAccountModel();
            const t = await Model.sequelize.transaction();

            try {
                const accr = await this._accrueInterest(accountId, Date.now(), t);

                if (accr.balance < amount) {
                    await t.rollback();
                    return { success: false, error: 'not_enough_bank_money' };
                }

                const newBalance = accr.balance - amount;

                const [affected] = await Model.update(
                    {
                        balance: Sequelize.literal(`balance - ${amount}`),
                    },
                    {
                        where: {
                            account_id: accountId,
                            balance: { [Op.gte]: amount },
                        },
                        transaction: t,
                    }
                );

                if (!affected) {
                    await t.rollback();
                    return { success: false, error: 'not_enough_bank_money' };
                }

                const added = await moneyService.addMoney(accountId, amount, 'снятие из банка', t);

                if (!added) {
                    await t.rollback();
                    return { success: false, error: 'db_error' };
                }

                await getBankLedgerModel().create(
                    {
                        account_id: accountId,
                        type: 'withdraw',
                        amount: -amount,
                        balance_after: newBalance,
                        reason: 'снятие из банка',
                    },
                    { transaction: t }
                );

                await t.commit();

                if (typeof player.applyMoneyDelta === 'function') {
                    player.applyMoneyDelta(amount);
                }

                await this._invalidateEconomy();

                logger.info(
                    `[BankService] ${player.accountName || accountId} снял из банка $${amount}`
                );

                return {
                    success: true,
                    balance: newBalance,
                    accrued: accr.accrued,
                };
            } catch (err) {
                try {
                    await t.rollback();
                } catch {}

                logger.error(`[BankService] withdraw ${accountId}: ${err.message}`);
                return { success: false, error: 'db_error' };
            }
        });
    }

    /**
     * Перевод между банковскими счетами.
     */
    async transfer(actor, toAccountId, amount) {
        const fromId = actor?.accountId;
        const toId = Number(toAccountId);

        if (!fromId || !Number.isSafeInteger(toId) || toId <= 0) {
            return { success: false, error: 'not_authorized' };
        }

        if (fromId === toId) {
            return { success: false, error: 'self_transfer' };
        }

        const invalid = this._validateAmount(amount, 'maxTransfer');
        if (invalid) {
            return { success: false, error: invalid };
        }

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

                    const fromAccr = await this._accrueInterest(fromId, Date.now(), t);
                    const toAccr = await this._accrueInterest(toId, Date.now(), t);

                    const fromNewBalance = fromAccr.balance - amount;
                    const toNewBalance = toAccr.balance + amount;

                    if (
                        Number.isSafeInteger(BankConfig.maxBalance) &&
                        BankConfig.maxBalance > 0 &&
                        toNewBalance > BankConfig.maxBalance
                    ) {
                        await t.rollback();
                        return { success: false, error: 'amount_too_large' };
                    }

                    const [sent] = await Model.update(
                        {
                            balance: Sequelize.literal(`balance - ${amount}`),
                        },
                        {
                            where: {
                                account_id: fromId,
                                balance: { [Op.gte]: amount },
                            },
                            transaction: t,
                        }
                    );

                    if (!sent) {
                        await t.rollback();
                        return { success: false, error: 'not_enough_bank_money' };
                    }

                    const [received] = await Model.update(
                        {
                            balance: Sequelize.literal(`balance + ${amount}`),
                        },
                        {
                            where: { account_id: toId },
                            transaction: t,
                        }
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
                        `[BankService] ${actor.accountName || fromId} перевёл $${amount} в банк аккаунту ${toId}`
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

    /**
     * История операций для UI / админки.
     */
    async getLedger(accountId, limit = 20) {
        const per = Math.max(1, Math.min(Number(limit) || 20, 100));

        const rows = await getBankLedgerModel().findAll({
            where: { account_id: accountId },
            order: [['created_at', 'DESC']],
            limit: per,
            raw: true,
        });

        return rows.map((r) => ({
            id: r.id,
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
