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
        fees: {
            transferPercent: 0,
            minFee: 0,
        },
    },
}));

jest.mock('../models/BankAccount', () => ({
    getBankAccountModel: jest.fn(),
}));

jest.mock('../models/BankLedger', () => ({
    getBankLedgerModel: jest.fn(),
}));

jest.mock('../models/Users', () => ({
    getUserModel: jest.fn(),
}));

jest.mock('../services/MoneyService', () => ({
    takeMoney: jest.fn(),
    addMoney: jest.fn(),
}));

jest.mock('../services/StatsService', () => ({
    invalidateEconomyCache: jest.fn(),
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { Sequelize } = require('sequelize');

const { getBankAccountModel } = require('../models/BankAccount');
const { getBankLedgerModel } = require('../models/BankLedger');
const { getUserModel } = require('../models/Users');
const moneyService = require('../services/MoneyService');
const statsService = require('../services/StatsService');
const bankService = require('../services/BankService');
const { BankConfig } = require('../config');

const mockTx = {
    commit: jest.fn(),
    rollback: jest.fn(),
};

let bankAccountModel;
let bankLedgerModel;
let userModel;

const makePlayer = (overrides = {}) => ({
    accountId: 1,
    accountName: 'tester',
    applyMoneyDelta: jest.fn(),
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();

    BankConfig.interest.enabled = false;
    BankConfig.interest.ratePerPeriod = 0.1;
    BankConfig.interest.minBalance = 0;
    BankConfig.interest.maxCatchupPeriods = 7;

    bankAccountModel = {
        findByPk: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        sequelize: {
            transaction: jest.fn().mockResolvedValue(mockTx),
        },
    };

    bankLedgerModel = {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findAll: jest.fn().mockResolvedValue([]),
    };

    userModel = {
        findByPk: jest.fn(),
    };

    getBankAccountModel.mockReturnValue(bankAccountModel);
    getBankLedgerModel.mockReturnValue(bankLedgerModel);
    getUserModel.mockReturnValue(userModel);

    moneyService.takeMoney.mockResolvedValue(true);
    moneyService.addMoney.mockResolvedValue(true);
    statsService.invalidateEconomyCache.mockResolvedValue(undefined);

    mockTx.commit.mockResolvedValue(undefined);
    mockTx.rollback.mockResolvedValue(undefined);
});

describe('BankService: deposit', () => {
    test('успешно переводит наличные в банк', async () => {
        const player = makePlayer();

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 100,
            last_accrued_at: new Date(),
        });

        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.deposit(player, 250);

        expect(result).toEqual({
            success: true,
            balance: 350,
            accrued: 0,
        });

        expect(moneyService.takeMoney).toHaveBeenCalledWith(1, 250, 'пополнение банка', mockTx);

        expect(bankAccountModel.update).toHaveBeenCalledWith(
            {
                balance: expect.any(Sequelize.Utils.Literal),
            },
            {
                where: { account_id: 1 },
                transaction: mockTx,
            }
        );

        expect(bankLedgerModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                account_id: 1,
                type: 'deposit',
                amount: 250,
                balance_after: 350,
            }),
            { transaction: mockTx }
        );

        expect(player.applyMoneyDelta).toHaveBeenCalledWith(-250);
        expect(mockTx.commit).toHaveBeenCalledTimes(1);
        expect(mockTx.rollback).not.toHaveBeenCalled();
        expect(statsService.invalidateEconomyCache).toHaveBeenCalledTimes(1);
    });

    test('создаёт банковский счёт при первом пополнении', async () => {
        const player = makePlayer();

        bankAccountModel.findByPk.mockResolvedValue(null);
        bankAccountModel.create.mockResolvedValue({
            account_id: 1,
            balance: 0,
            last_accrued_at: new Date(),
        });
        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.deposit(player, 500);

        expect(result.success).toBe(true);
        expect(bankAccountModel.create).toHaveBeenCalledWith(
            {
                account_id: 1,
                balance: 0,
                last_accrued_at: expect.any(Date),
            },
            { transaction: mockTx }
        );
    });

    test('отклоняет некорректную сумму', async () => {
        const player = makePlayer();

        const result = await bankService.deposit(player, 0);

        expect(result).toEqual({ success: false, error: 'invalid_amount' });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    test('отклоняет сумму выше лимита депозита', async () => {
        const player = makePlayer();

        const result = await bankService.deposit(player, BankConfig.maxDeposit + 1);

        expect(result).toEqual({ success: false, error: 'amount_too_large' });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    test('при недостатке наличных откатывает транзакцию', async () => {
        const player = makePlayer();

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 100,
            last_accrued_at: new Date(),
        });

        moneyService.takeMoney.mockResolvedValue(false);

        const result = await bankService.deposit(player, 250);

        expect(result).toEqual({ success: false, error: 'not_enough_money' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(mockTx.commit).not.toHaveBeenCalled();
        expect(bankLedgerModel.create).not.toHaveBeenCalled();
        expect(player.applyMoneyDelta).not.toHaveBeenCalled();
    });

    test('ошибка БД приводит к rollback и db_error', async () => {
        const player = makePlayer();

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 100,
            last_accrued_at: new Date(),
        });

        bankAccountModel.update.mockRejectedValue(new Error('db down'));

        const result = await bankService.deposit(player, 50);

        expect(result).toEqual({ success: false, error: 'db_error' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(mockTx.commit).not.toHaveBeenCalled();
    });
});

describe('BankService: withdraw', () => {
    test('успешно снимает банковские деньги в наличные', async () => {
        const player = makePlayer();

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 500,
            last_accrued_at: new Date(),
        });

        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.withdraw(player, 200);

        expect(result).toEqual({
            success: true,
            balance: 300,
            accrued: 0,
        });

        expect(moneyService.addMoney).toHaveBeenCalledWith(1, 200, 'снятие из банка', mockTx);

        expect(bankLedgerModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                account_id: 1,
                type: 'withdraw',
                amount: -200,
                balance_after: 300,
            }),
            { transaction: mockTx }
        );

        expect(player.applyMoneyDelta).toHaveBeenCalledWith(200);
        expect(mockTx.commit).toHaveBeenCalledTimes(1);
    });

    test('нельзя снять больше, чем есть на банковском счёте', async () => {
        const player = makePlayer();

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 100,
            last_accrued_at: new Date(),
        });

        const result = await bankService.withdraw(player, 200);

        expect(result).toEqual({ success: false, error: 'not_enough_bank_money' });
        expect(moneyService.addMoney).not.toHaveBeenCalled();
        expect(bankAccountModel.update).not.toHaveBeenCalled();
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(mockTx.commit).not.toHaveBeenCalled();
    });

    test('отклоняет некорректную сумму', async () => {
        const player = makePlayer();

        const result = await bankService.withdraw(player, -10);

        expect(result).toEqual({ success: false, error: 'invalid_amount' });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });
});

describe('BankService: transfer', () => {
    test('успешный перевод между банковскими счетами пишет две ноги ledger', async () => {
        const actor = makePlayer({ accountId: 1 });

        userModel.findByPk.mockResolvedValue({ id: 2 });

        bankAccountModel.findByPk.mockImplementation(async (id) => {
            if (id === 1) {
                return {
                    account_id: 1,
                    balance: 500,
                    last_accrued_at: new Date(),
                };
            }

            return {
                account_id: 2,
                balance: 100,
                last_accrued_at: new Date(),
            };
        });

        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.transfer(actor, 2, 500);

        expect(result.success).toBe(true);
        expect(result.fromBalance).toBe(0);
        expect(result.toBalance).toBe(600);
        expect(typeof result.referenceId).toBe('string');

        expect(bankAccountModel.update).toHaveBeenCalledTimes(2);
        expect(bankLedgerModel.create).toHaveBeenCalledTimes(2);

        const [outCall, inCall] = bankLedgerModel.create.mock.calls.map((c) => c[0]);

        expect(outCall).toMatchObject({
            account_id: 1,
            type: 'transfer_out',
            amount: -500,
            balance_after: 0,
        });

        expect(inCall).toMatchObject({
            account_id: 2,
            type: 'transfer_in',
            amount: 500,
            balance_after: 600,
        });

        expect(outCall.reference_id).toEqual(inCall.reference_id);
        expect(mockTx.commit).toHaveBeenCalledTimes(1);
    });

    test('нельзя перевести самому себе', async () => {
        const actor = makePlayer({ accountId: 1 });

        const result = await bankService.transfer(actor, 1, 100);

        expect(result).toEqual({ success: false, error: 'self_transfer' });
        expect(bankAccountModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    test('получатель должен существовать', async () => {
        const actor = makePlayer({ accountId: 1 });

        userModel.findByPk.mockResolvedValue(null);

        const result = await bankService.transfer(actor, 2, 100);

        expect(result).toEqual({ success: false, error: 'recipient_not_found' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(bankAccountModel.update).not.toHaveBeenCalled();
    });

    test('нельзя перевести больше, чем есть на счёте', async () => {
        const actor = makePlayer({ accountId: 1 });

        userModel.findByPk.mockResolvedValue({ id: 2 });

        bankAccountModel.findByPk.mockImplementation(async (id) => {
            if (id === 1) {
                return { account_id: 1, balance: 100, last_accrued_at: new Date() };
            }
            return { account_id: 2, balance: 0, last_accrued_at: new Date() };
        });

        bankAccountModel.update.mockResolvedValue([0]);

        const result = await bankService.transfer(actor, 2, 500);

        expect(result).toEqual({ success: false, error: 'not_enough_bank_money' });
        expect(mockTx.rollback).toHaveBeenCalledTimes(1);
        expect(mockTx.commit).not.toHaveBeenCalled();
        expect(bankLedgerModel.create).not.toHaveBeenCalled();
    });
});

describe('BankService: interest', () => {
    beforeEach(() => {
        BankConfig.interest.enabled = true;
        BankConfig.interest.periodMs = 1000;
        BankConfig.interest.ratePerPeriod = 0.1;
        BankConfig.interest.minBalance = 0;
        BankConfig.interest.maxCatchupPeriods = 7;
    });

    test('начисляет сложные проценты за завершившиеся периоды', async () => {
        const now = 1000000;

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 100,
            last_accrued_at: new Date(now - 2500),
        });

        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);

        expect(result).toMatchObject({
            success: true,
            accrued: 21,
            periods: 2,
            balance: 121,
        });

        expect(bankLedgerModel.create).toHaveBeenCalledTimes(2);

        const calls = bankLedgerModel.create.mock.calls.map((c) => c[0]);

        expect(calls[0]).toMatchObject({
            account_id: 1,
            type: 'interest',
            amount: 10,
            balance_after: 110,
        });

        expect(calls[1]).toMatchObject({
            account_id: 1,
            type: 'interest',
            amount: 11,
            balance_after: 121,
        });

        expect(calls[0].period_key).not.toEqual(calls[1].period_key);
        expect(mockTx.commit).toHaveBeenCalledTimes(1);
    });

    test('уважает maxCatchupPeriods', async () => {
        BankConfig.interest.maxCatchupPeriods = 1;

        const now = 1000000;

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 100,
            last_accrued_at: new Date(now - 2500),
        });

        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);

        expect(result).toMatchObject({
            success: true,
            periods: 1,
            balance: 110,
        });

        expect(bankLedgerModel.create).toHaveBeenCalledTimes(1);
    });

    test('при минимальном остатке не начисляет процент, но двигает last_accrued_at', async () => {
        BankConfig.interest.minBalance = 100;

        const now = 1000000;

        bankAccountModel.findByPk.mockResolvedValue({
            account_id: 1,
            balance: 50,
            last_accrued_at: new Date(now - 1500),
        });

        bankAccountModel.update.mockResolvedValue([1]);

        const result = await bankService.accrueForAccount(1, now);

        expect(result).toMatchObject({
            success: true,
            accrued: 0,
            periods: 1,
            balance: 50,
        });

        expect(bankLedgerModel.create).not.toHaveBeenCalled();

        expect(bankAccountModel.update).toHaveBeenCalledWith(
            {
                last_accrued_at: expect.any(Date),
            },
            {
                where: { account_id: 1 },
                transaction: mockTx,
            }
        );
    });
});
