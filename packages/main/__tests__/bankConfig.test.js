const {
    BankPos,
    BankInteractionRadius,
    BankConfig,
    InteractionHints,
} = require('../config');

describe('BankConfig', () => {
    test('BankPos содержит валидные координаты', () => {
        expect(BankPos).toBeDefined();
        expect(Number.isFinite(BankPos.x)).toBe(true);
        expect(Number.isFinite(BankPos.y)).toBe(true);
        expect(Number.isFinite(BankPos.z)).toBe(true);
        expect(Number.isFinite(BankPos.h)).toBe(true);
    });

    test('BankInteractionRadius положительный', () => {
        expect(Number.isFinite(BankInteractionRadius)).toBe(true);
        expect(BankInteractionRadius).toBeGreaterThan(0);
    });

    test('лимиты банка — целые положительные числа', () => {
        expect(Number.isSafeInteger(BankConfig.maxBalance)).toBe(true);
        expect(BankConfig.maxBalance).toBeGreaterThan(0);

        expect(Number.isSafeInteger(BankConfig.minOperation)).toBe(true);
        expect(BankConfig.minOperation).toBeGreaterThan(0);

        expect(Number.isSafeInteger(BankConfig.maxDeposit)).toBe(true);
        expect(BankConfig.maxDeposit).toBeGreaterThanOrEqual(BankConfig.minOperation);

        expect(Number.isSafeInteger(BankConfig.maxWithdraw)).toBe(true);
        expect(BankConfig.maxWithdraw).toBeGreaterThanOrEqual(BankConfig.minOperation);

        expect(Number.isSafeInteger(BankConfig.maxTransfer)).toBe(true);
        expect(BankConfig.maxTransfer).toBeGreaterThanOrEqual(BankConfig.minOperation);
    });

    test('настройки процента в разумном диапазоне', () => {
        const interest = BankConfig.interest;

        expect(typeof interest.enabled).toBe('boolean');
        expect(Number.isSafeInteger(interest.periodMs)).toBe(true);
        expect(interest.periodMs).toBeGreaterThan(0);

        expect(typeof interest.ratePerPeriod).toBe('number');
        expect(interest.ratePerPeriod).toBeGreaterThan(0);
        expect(interest.ratePerPeriod).toBeLessThan(0.05);

        expect(Number.isSafeInteger(interest.minBalance)).toBe(true);
        expect(interest.minBalance).toBeGreaterThanOrEqual(0);

        expect(Number.isSafeInteger(interest.maxCatchupPeriods)).toBe(true);
        expect(interest.maxCatchupPeriods).toBeGreaterThan(0);
        expect(interest.maxCatchupPeriods).toBeLessThanOrEqual(30);

        expect(typeof interest.accrueOnOpen).toBe('boolean');
    });

    test('комиссии не отрицательные', () => {
        const fees = BankConfig.fees;

        expect(typeof fees.transferPercent).toBe('number');
        expect(fees.transferPercent).toBeGreaterThanOrEqual(0);
        expect(fees.transferPercent).toBeLessThan(0.1);

        expect(Number.isSafeInteger(fees.minFee)).toBe(true);
        expect(fees.minFee).toBeGreaterThanOrEqual(0);
    });

    test('банк добавлен в подсказки взаимодействий', () => {
        expect(typeof InteractionHints.bank).toBe('string');
        expect(InteractionHints.bank.length).toBeGreaterThan(0);
    });
});