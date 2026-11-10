jest.mock('../config', () => ({
    BankConfig: {
        maxBalance: 2000000000,
        minOperation: 1,
        maxDeposit: 1000000,
        maxWithdraw: 1000000,
        maxTransfer: 1000000,
        includeInEconomy: true,
        interest: {
            enabled: false,
            periodMs: 1000,
            ratePerPeriod: 0.1,
            minBalance: 0,
            maxCatchupPeriods: 7,
            accrueOnOpen: true,
        },
        settlement: {
            periodMs: 1000,
            cashbackMaxCatchupPeriods: 7,
            feeMaxCatchupPeriods: 7,
            basePlanId: 1,
        },
        fees: { transferPercent: 0, minFee: 0 },
    },
    CardPlans: {
        1: {
            id: 1,
            name: 'Базовый',
            dailyFee: 0,
            transferDailyLimit: 50000,
            withdrawFreeDailyLimit: 20000,
            overTransferFeePercent: 0.05,
            overWithdrawFeePercent: 0.05,
            cashbackPercent: 0,
        },
        2: {
            id: 2,
            name: 'Стандарт',
            dailyFee: 500,
            transferDailyLimit: 500000,
            withdrawFreeDailyLimit: 200000,
            overTransferFeePercent: 0.02,
            overWithdrawFeePercent: 0.02,
            cashbackPercent: 0.01,
        },
        3: {
            id: 3,
            name: 'Премиум',
            dailyFee: 2000,
            transferDailyLimit: 5000000,
            withdrawFreeDailyLimit: 2000000,
            overTransferFeePercent: 0.01,
            overWithdrawFeePercent: 0.01,
            cashbackPercent: 0.03,
        },
    },
    DepositConfig: {
        maxActiveDeposits: 5,
        flexible: { ratePerHour: 0.1, periodMs: 1000, minPrincipal: 100, maxCatchupPeriods: 7 },
        frozen: {
            minPrincipal: 1000,
            earlyPenaltyPercent: 0.5,
            maxCatchupPeriods: 7,
            tiers: [{ days: 7, ratePerDay: 0.1 }],
        },
    },
}));

jest.mock('../models/BankAccount', () => ({ getBankAccountModel: jest.fn() }));
jest.mock('../models/BankLedger', () => ({ getBankLedgerModel: jest.fn() }));
jest.mock('../models/BankDeposit', () => ({ getBankDepositModel: jest.fn() }));
jest.mock('../models/Users', () => ({ getUserModel: jest.fn() }));
jest.mock('../services/MoneyService', () => ({ takeMoney: jest.fn(), addMoney: jest.fn() }));
jest.mock('../services/StatsService', () => ({ invalidateEconomyCache: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { getBankAccountModel } = require('../models/BankAccount');
const { getBankLedgerModel } = require('../models/BankLedger');
const { getBankDepositModel } = require('../models/BankDeposit');
const { getUserModel } = require('../models/Users');
const moneyService = require('../services/MoneyService');
const statsService = require('../services/StatsService');
const bankService = require('../services/BankService');
const { BankConfig, CardPlans, DepositConfig } = require('../config');

const mockTx = { commit: jest.fn(), rollback: jest.fn() };

let bankAccountModel;
let bankLedgerModel;
let bankDepositModel;
let userModel;

const makePlayer = (overrides = {}) => ({
    accountId: 1,
    accountName: 'tester',
    applyMoneyDelta: jest.fn(),
    ...overrides,
});

const accountRow = (o = {}) => ({
    account_id: 1,
    balance: 0,
    last_accrued_at: new Date(),
    plan_id: 1,
    cashback_pending: 0,
    ...o,
});

beforeEach(() => {
    jest.clearAllMocks();

    bankAccountModel = {
        findByPk: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        sequelize: { transaction: jest.fn().mockResolvedValue(mockTx) },
    };
    bankLedgerModel = {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findAll: jest.fn().mockResolvedValue([]),
    };
    bankDepositModel = {
        findByPk: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findAll: jest.fn().mockResolvedValue([]),
    };
    userModel = { findByPk: jest.fn() };

    getBankAccountModel.mockReturnValue(bankAccountModel);
    getBankLedgerModel.mockReturnValue(bankLedgerModel);
    getBankDepositModel.mockReturnValue(bankDepositModel);
    getUserModel.mockReturnValue(userModel);

    moneyService.takeMoney.mockResolvedValue(true);
    moneyService.addMoney.mockResolvedValue(true);
    statsService.invalidateEconomyCache.mockResolvedValue(undefined);
    mockTx.commit.mockResolvedValue(undefined);
    mockTx.rollback.mockResolvedValue(undefined);
});

describe('BankService: deposit (карта)', () => {
    test('успешно переводит наличные на карту', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 100 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.deposit(player, 250);

        expect(result).toMatchObject({ success: true, balance: 350 });
        expect(moneyService.takeMoney).toHaveBeenCalledWith(1, 250, 'пополнение карты', mockTx);
        expect(bankLedgerModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                account_id: 1,
                deposit_id: 0,
                type: 'deposit',
                amount: 250,
                balance_after: 350,
            }),
            { transaction: mockTx }
        );
        expect(player.applyMoneyDelta).toHaveBeenCalledWith(-250);
        expect(mockTx.commit).toHaveBeenCalledTimes(1);
        expect(mockTx.rollback).not.toHaveBeenCalled();
    });

    test('создаёт счёт при первом пополнении', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(null);
        bankAccountModel.create.mockResolvedValue(accountRow({ balance: 0 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.deposit(player, 500);
        expect(result.success).toBe(true);
        expect(bankAccountModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                account_id: 1,
                balance: 0,
                plan_id: BankConfig.settlement.basePlanId,
            }),
            { transaction: mockTx }
        );
    });

    test('отклоняет некорректную сумму и сумму выше лимита', async () => {
        const player = makePlayer();
        expect(await bankService.deposit(player, 0)).toEqual({
            success: false,
            error: 'invalid_amount',
        });
        expect(await bankService.deposit(player, BankConfig.maxDeposit + 1)).toEqual({
            success: false,
            error: 'amount_too_large',
        });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    test('при недостатке наличных откатывает', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 100 }));
        moneyService.takeMoney.mockResolvedValue(false);

        const result = await bankService.deposit(player, 250);
        expect(result).toEqual({ success: false, error: 'not_enough_money' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(bankLedgerModel.create).not.toHaveBeenCalled();
    });

    test('ошибка БД => rollback + db_error', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 100 }));
        bankAccountModel.update.mockRejectedValue(new Error('db down'));

        expect(await bankService.deposit(player, 50)).toEqual({
            success: false,
            error: 'db_error',
        });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    });
});

describe('BankService: withdraw (карта)', () => {
    test('успешно снимает на наличные', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 500 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.withdraw(player, 200);
        expect(result).toMatchObject({ success: true, balance: 300 });
        expect(moneyService.addMoney).toHaveBeenCalledWith(1, 200, 'снятие с карты', mockTx);
        expect(bankLedgerModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'withdraw',
                amount: -200,
                balance_after: 300,
                deposit_id: 0,
            }),
            { transaction: mockTx }
        );
        expect(player.applyMoneyDelta).toHaveBeenCalledWith(200);
    });

    test('нельзя снять больше остатка', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 100 }));

        const result = await bankService.withdraw(player, 200);
        expect(result).toEqual({ success: false, error: 'not_enough_bank_money' });
        expect(moneyService.addMoney).not.toHaveBeenCalled();
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    });
});

describe('BankService: transfer (карта)', () => {
    test('перевод пишет две ноги с общим reference_id', async () => {
        const actor = makePlayer({ accountId: 1 });
        userModel.findByPk.mockResolvedValue({ id: 2 });
        bankAccountModel.findByPk.mockImplementation(async (id) =>
            id === 1
                ? accountRow({ account_id: 1, balance: 500 })
                : accountRow({ account_id: 2, balance: 100 })
        );
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.transfer(actor, 2, 500);
        expect(result).toMatchObject({ success: true, fromBalance: 0, toBalance: 600 });
        expect(typeof result.referenceId).toBe('string');
        expect(bankLedgerModel.create).toHaveBeenCalledTimes(2);

        const [out, inn] = bankLedgerModel.create.mock.calls.map((c) => c[0]);
        expect(out).toMatchObject({
            account_id: 1,
            type: 'transfer_out',
            amount: -500,
            deposit_id: 0,
        });
        expect(inn).toMatchObject({
            account_id: 2,
            type: 'transfer_in',
            amount: 500,
            deposit_id: 0,
        });
        expect(out.reference_id).toEqual(inn.reference_id);
    });

    test('запрет self-transfer и несуществующего получателя', async () => {
        const actor = makePlayer({ accountId: 1 });
        expect(await bankService.transfer(actor, 1, 100)).toEqual({
            success: false,
            error: 'self_transfer',
        });

        userModel.findByPk.mockResolvedValue(null);
        expect(await bankService.transfer(actor, 2, 100)).toEqual({
            success: false,
            error: 'recipient_not_found',
        });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    });

    test('нельзя перевести больше остатка', async () => {
        const actor = makePlayer({ accountId: 1 });
        userModel.findByPk.mockResolvedValue({ id: 2 });
        bankAccountModel.findByPk.mockImplementation(async (id) =>
            id === 1
                ? accountRow({ account_id: 1, balance: 100 })
                : accountRow({ account_id: 2, balance: 0 })
        );
        bankAccountModel.update.mockResolvedValue([0]);

        expect(await bankService.transfer(actor, 2, 500)).toEqual({
            success: false,
            error: 'not_enough_bank_money',
        });
        expect(bankLedgerModel.create).not.toHaveBeenCalled();
    });
});

describe('BankService: card settlement', () => {
    test('переносит pending-кэшбэк в баланс за завершившийся период', async () => {
        const now = 1000000;
        bankAccountModel.findByPk.mockResolvedValue(
            accountRow({
                balance: 1000,
                cashback_pending: 250,
                last_accrued_at: new Date(now - 1500),
            })
        );
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);
        expect(result).toMatchObject({ success: true, accrued: 250, balance: 1250 });

        const cb = bankLedgerModel.create.mock.calls
            .map((c) => c[0])
            .find((x) => x.type === 'cashback');
        expect(cb).toMatchObject({ deposit_id: 0, amount: 250, balance_after: 1250 });
        expect(cb.period_key).toBeDefined();
    });

    test('списывает dailyFee тарифа', async () => {
        const now = 1000000;
        bankAccountModel.findByPk.mockResolvedValue(
            accountRow({
                balance: 5000,
                plan_id: 3,
                cashback_pending: 0,
                last_accrued_at: new Date(now - 1500),
            })
        );
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);
        expect(result).toMatchObject({ success: true, fee: 2000, balance: 3000 });

        const fee = bankLedgerModel.create.mock.calls
            .map((c) => c[0])
            .find((x) => x.type === 'plan_fee');
        expect(fee).toMatchObject({ deposit_id: 0, amount: -2000, balance_after: 3000 });
    });

    test('авто-даунгрейд при нехватке денег на плату, баланс не уходит в минус', async () => {
        const now = 1000000;
        bankAccountModel.findByPk.mockResolvedValue(
            accountRow({
                balance: 1000,
                plan_id: 3,
                cashback_pending: 0,
                last_accrued_at: new Date(now - 1500),
            })
        );
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);
        expect(result).toMatchObject({ success: true, downgraded: true, balance: 1000 });

        const dg = bankLedgerModel.create.mock.calls
            .map((c) => c[0])
            .find((x) => x.type === 'plan_downgrade');
        expect(dg).toBeDefined();
        const planUpdate = bankAccountModel.update.mock.calls.find((c) => c[0].plan_id === 1);
        expect(planUpdate).toBeDefined();
    });

    test('идемпотентность: повторный settlement за тот же период не удваивает кэшбэк', async () => {
        const now = 1000000;
        bankAccountModel.findByPk.mockResolvedValue(
            accountRow({
                balance: 1000,
                cashback_pending: 250,
                last_accrued_at: new Date(now - 1500),
            })
        );
        bankAccountModel.update.mockResolvedValue([1]);

        const first = await bankService.accrueForAccount(1, now);
        expect(first.accrued).toBe(250);

        bankAccountModel.findByPk.mockResolvedValue(
            accountRow({ balance: 1250, cashback_pending: 0, last_accrued_at: new Date(now - 500) })
        );
        const second = await bankService.accrueForAccount(1, now);
        expect(second.accrued).toBe(0);
        expect(second.periods).toBe(0);
    });

    test('cap офлайна: не более cashbackMaxCatchupPeriods периодов кэшбэка', async () => {
        BankConfig.settlement.cashbackMaxCatchupPeriods = 2;
        const now = 1000000;
        bankAccountModel.findByPk.mockResolvedValue(
            accountRow({
                balance: 1000,
                cashback_pending: 100,
                last_accrued_at: new Date(now - 5000),
            })
        );
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);
        const cashbackRows = bankLedgerModel.create.mock.calls
            .map((c) => c[0])
            .filter((x) => x.type === 'cashback');
        expect(cashbackRows.length).toBeLessThanOrEqual(2);
        expect(result.periods).toBeLessThanOrEqual(
            Math.max(
                BankConfig.settlement.cashbackMaxCatchupPeriods,
                BankConfig.settlement.feeMaxCatchupPeriods
            )
        );
        BankConfig.settlement.cashbackMaxCatchupPeriods = 7;
    });
});

describe('BankService: setPlan', () => {
    test('смена тарифа пишет plan_change и обновляет plan_id', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 1000, plan_id: 1 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.setPlan(player, 3);
        expect(result).toMatchObject({ success: true, plan: CardPlans[3] });
        expect(bankAccountModel.update).toHaveBeenCalledWith(
            { plan_id: 3 },
            { where: { account_id: 1 }, transaction: mockTx }
        );
        expect(bankLedgerModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'plan_change', amount: 0, deposit_id: 0 }),
            { transaction: mockTx }
        );
    });

    test('неизвестный тариф отклоняется без транзакции', async () => {
        const player = makePlayer();
        expect(await bankService.setPlan(player, 99)).toEqual({
            success: false,
            error: 'unknown_plan',
        });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    test('повторная установка того же тарифа — no-op', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ plan_id: 2 }));
        const result = await bankService.setPlan(player, 2);
        expect(result).toMatchObject({ success: true, unchanged: true });
        expect(bankLedgerModel.create).not.toHaveBeenCalled();
    });
});

describe('BankService: createDeposit', () => {
    test('гибкий вклад списывает с карты и пишет две ноги ledger', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 10000 }));
        bankAccountModel.update.mockResolvedValue([1]);
        bankDepositModel.count.mockResolvedValue(0);
        bankDepositModel.create.mockResolvedValue({
            id: 7,
            account_id: 1,
            kind: 'flexible',
            principal: 5000,
            balance: 5000,
            rate_per_period: DepositConfig.flexible.ratePerHour,
            period_ms: DepositConfig.flexible.periodMs,
            matures_at: null,
            status: 'active',
            early_penalty_percent: 0,
        });

        const result = await bankService.createDeposit(player, 'flexible', 5000);
        expect(result).toMatchObject({ success: true, cardBalance: 5000 });
        expect(result.deposit).toMatchObject({
            id: 7,
            kind: 'flexible',
            principal: 5000,
            matures_at: null,
        });

        const legs = bankLedgerModel.create.mock.calls.map((c) => c[0]);
        const fund = legs.find((x) => x.type === 'deposit_fund');
        const open = legs.find((x) => x.type === 'deposit_open');
        expect(fund).toMatchObject({ deposit_id: 0, amount: -5000, balance_after: 5000 });
        expect(open).toMatchObject({ deposit_id: 7, amount: 5000, balance_after: 5000 });
    });

    test('замороженный вклад фиксирует tier-ставку и matures_at', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 20000 }));
        bankAccountModel.update.mockResolvedValue([1]);
        bankDepositModel.count.mockResolvedValue(0);
        bankDepositModel.create.mockImplementation(async (data) => ({ id: 8, ...data }));

        const result = await bankService.createDeposit(player, 'frozen', 10000, 7);
        expect(result.success).toBe(true);
        const created = bankDepositModel.create.mock.calls[0][0];
        expect(created.kind).toBe('frozen');
        expect(created.rate_per_period).toBe(DepositConfig.frozen.tiers[0].ratePerDay);
        expect(created.period_ms).toBe(24 * 60 * 60 * 1000);
        expect(created.matures_at).toBeInstanceOf(Date);
        expect(created.early_penalty_percent).toBe(DepositConfig.frozen.earlyPenaltyPercent);
    });

    test('отклоняет сумму ниже minPrincipal', async () => {
        const player = makePlayer();
        expect(await bankService.createDeposit(player, 'frozen', 100, 7)).toEqual({
            success: false,
            error: 'min_principal',
        });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    test('отклоняет при превышении maxActiveDeposits', async () => {
        const player = makePlayer();
        bankDepositModel.count.mockResolvedValue(DepositConfig.maxActiveDeposits);
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 10000 }));

        const result = await bankService.createDeposit(player, 'flexible', 5000);
        expect(result).toEqual({ success: false, error: 'too_many_deposits' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(bankDepositModel.create).not.toHaveBeenCalled();
    });

    test('нельзя открыть вклад с недостатком на карте', async () => {
        const player = makePlayer();
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 100 }));
        bankDepositModel.count.mockResolvedValue(0);

        const result = await bankService.createDeposit(player, 'flexible', 5000);
        expect(result).toEqual({ success: false, error: 'not_enough_bank_money' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
    });
});

describe('BankService: deposit accrue', () => {
    test('гибкий вклад начисляет сложные проценты по своему периоду', async () => {
        const now = 1000000;
        bankDepositModel.findByPk.mockResolvedValue({
            id: 7,
            account_id: 1,
            kind: 'flexible',
            principal: 100,
            balance: 100,
            rate_per_period: 0.1,
            period_ms: 1000,
            last_accrued_at: new Date(now - 2500),
            matures_at: null,
            status: 'active',
            early_penalty_percent: 0,
        });
        bankDepositModel.update.mockResolvedValue([1]);

        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 0 }));
        bankAccountModel.update.mockResolvedValue([1]);
        bankDepositModel.update.mockResolvedValue([1]);

        const result = await bankService.closeDeposit(makePlayer(), 7, false, now);
        expect(result).toMatchObject({ success: true, penalty: 0 });
        expect(result.payout).toBe(121);

        const interestRows = bankLedgerModel.create.mock.calls
            .map((c) => c[0])
            .filter((x) => x.type === 'deposit_interest');
        expect(interestRows.length).toBe(2);
        expect(interestRows[0]).toMatchObject({ deposit_id: 7, amount: 10, balance_after: 110 });
        expect(interestRows[1]).toMatchObject({ deposit_id: 7, amount: 11, balance_after: 121 });
        expect(interestRows[0].period_key).not.toEqual(interestRows[1].period_key);
    });

    test('frozen вклад начисляет проценты только до matures_at', async () => {
        const now = 1000000;
        bankDepositModel.findByPk.mockResolvedValue({
            id: 8,
            account_id: 1,
            kind: 'frozen',
            principal: 100,
            balance: 100,
            rate_per_period: 0.1,
            period_ms: 1000,
            last_accrued_at: new Date(now - 5000),
            matures_at: new Date(now - 1000),
            status: 'active',
            early_penalty_percent: 0.5,
        });
        bankDepositModel.update.mockResolvedValue([1]);
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 0 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.closeDeposit(makePlayer(), 8, false, now);
        expect(result.success).toBe(true);
        const interestRows = bankLedgerModel.create.mock.calls
            .map((c) => c[0])
            .filter((x) => x.type === 'deposit_interest');
        expect(interestRows.length).toBe(4);
        expect(result.penalty).toBe(0);
        expect(result.payout).toBe(146);
    });
});

describe('BankService: closeDeposit (frozen early)', () => {
    test('досрочное закрытие: штраф от наработанных процентов, тело целиком, консервативность', async () => {
        const now = 1000000;
        bankDepositModel.findByPk.mockResolvedValue({
            id: 9,
            account_id: 1,
            kind: 'frozen',
            principal: 10000,
            balance: 10000,
            rate_per_period: 0.1,
            period_ms: 1000,
            last_accrued_at: new Date(now - 1500),
            matures_at: new Date(now + 100000),
            status: 'active',
            early_penalty_percent: 0.5,
        });
        bankDepositModel.update.mockResolvedValue([1]);
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 0 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.closeDeposit(makePlayer(), 9, true, now);
        expect(result.success).toBe(true);
        expect(result.penalty).toBe(500);
        expect(result.payout).toBe(10500);
        expect(result.cardBalance).toBe(10500);

        const legs = bankLedgerModel.create.mock.calls.map((c) => c[0]);
        const close = legs.find((x) => x.type === 'deposit_close');
        const pen = legs.find((x) => x.type === 'deposit_penalty');
        const pay = legs.find((x) => x.type === 'deposit_payout');
        expect(close).toMatchObject({ deposit_id: 9, amount: -10500, balance_after: 0 });
        expect(pen).toMatchObject({ deposit_id: 9, amount: -500 });
        expect(pay).toMatchObject({ deposit_id: 0, amount: 10500, balance_after: 10500 });
        expect(result.payout + result.penalty).toBe(11000);
    });

    test('нельзя закрыть чужой или уже закрытый вклад', async () => {
        bankDepositModel.findByPk.mockResolvedValue({
            id: 9,
            account_id: 2,
            kind: 'flexible',
            principal: 100,
            balance: 100,
            rate_per_period: 0.1,
            period_ms: 1000,
            last_accrued_at: new Date(),
            matures_at: null,
            status: 'active',
            early_penalty_percent: 0,
        });
        expect(await bankService.closeDeposit(makePlayer({ accountId: 1 }), 9, false)).toEqual({
            success: false,
            error: 'not_owner',
        });

        bankDepositModel.findByPk.mockResolvedValue({
            id: 9,
            account_id: 1,
            kind: 'flexible',
            principal: 100,
            balance: 0,
            rate_per_period: 0.1,
            period_ms: 1000,
            last_accrued_at: new Date(),
            matures_at: null,
            status: 'closed',
            early_penalty_percent: 0,
        });
        expect(await bankService.closeDeposit(makePlayer({ accountId: 1 }), 9, false)).toEqual({
            success: false,
            error: 'deposit_closed',
        });
    });
});

describe('BankService: getDeposits auto-mature', () => {
    test('созревший frozen вклад автозакрывается при перечислении', async () => {
        const now = 1000000;
        bankDepositModel.findAll.mockResolvedValue([
            {
                id: 8,
                account_id: 1,
                kind: 'frozen',
                principal: 100,
                balance: 100,
                rate_per_period: 0.1,
                period_ms: 1000,
                last_accrued_at: new Date(now - 5000),
                matures_at: new Date(now - 1000),
                status: 'active',
                early_penalty_percent: 0.5,
            },
        ]);
        bankDepositModel.findByPk.mockResolvedValue({
            id: 8,
            account_id: 1,
            kind: 'frozen',
            principal: 100,
            balance: 100,
            rate_per_period: 0.1,
            period_ms: 1000,
            last_accrued_at: new Date(now - 5000),
            matures_at: new Date(now - 1000),
            status: 'active',
            early_penalty_percent: 0.5,
        });
        bankDepositModel.update.mockResolvedValue([1]);
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 0 }));
        bankAccountModel.update.mockResolvedValue([1]);

        const list = await bankService.getDeposits(1, now);
        expect(list[0]).toMatchObject({ id: 8, status: 'closed', maturedAuto: true });
        expect(list[0].payout).toBeGreaterThan(0);
    });
});

describe('BankService: statement & ledger', () => {
    test('выписка считает opening/closing balance и turnover по карте', async () => {
        const now = 1000000;
        bankLedgerModel.findAll.mockResolvedValue([
            {
                id: 1,
                type: 'deposit',
                amount: 500,
                balance_after: 500,
                created_at: new Date(now - 2000),
            },
            {
                id: 2,
                type: 'withdraw',
                amount: -200,
                balance_after: 300,
                created_at: new Date(now - 1000),
            },
        ]);
        bankAccountModel.findByPk.mockResolvedValue(accountRow({ balance: 300 }));

        const st = await bankService.getStatement(1, now - 3000, now, now);
        expect(st.turnover).toBe(300);
        expect(st.closingBalance).toBe(300);
        expect(st.openingBalance).toBe(0);
        expect(st.operations.length).toBe(2);
    });

    test('getLedger по умолчанию фильтрует deposit_id=0 (карта)', async () => {
        bankLedgerModel.findAll.mockResolvedValue([]);
        await bankService.getLedger(1, 20);
        expect(bankLedgerModel.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: { account_id: 1, deposit_id: 0 } })
        );
    });

    test('getLedger для конкретного вклада фильтрует по deposit_id', async () => {
        bankLedgerModel.findAll.mockResolvedValue([]);
        await bankService.getLedger(1, 20, 7);
        expect(bankLedgerModel.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: { account_id: 1, deposit_id: 7 } })
        );
    });
});
