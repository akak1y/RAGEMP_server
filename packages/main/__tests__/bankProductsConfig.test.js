const { CardPlans, DepositConfig, BankConfig } = require('../config');

const planIds = Object.keys(CardPlans)
    .map(Number)
    .sort((a, b) => a - b);

describe('CardPlans', () => {
    test('есть минимум 3 тарифа и базовый id=1', () => {
        expect(planIds.length).toBeGreaterThanOrEqual(3);
        expect(CardPlans[1]).toBeDefined();
        expect(BankConfig.settlement.basePlanId).toBe(1);
    });

    test('базовый тариф бесплатный и без кэшбэка', () => {
        const base = CardPlans[1];
        expect(base.dailyFee).toBe(0);
        expect(base.cashbackPercent).toBe(0);
    });

    test('поля каждого тарифа валидны', () => {
        for (const id of planIds) {
            const p = CardPlans[id];
            expect(p.id).toBe(id);
            expect(typeof p.name).toBe('string');
            expect(p.name.length).toBeGreaterThan(0);

            expect(Number.isSafeInteger(p.dailyFee)).toBe(true);
            expect(p.dailyFee).toBeGreaterThanOrEqual(0);

            expect(Number.isSafeInteger(p.transferDailyLimit)).toBe(true);
            expect(p.transferDailyLimit).toBeGreaterThan(0);

            expect(Number.isSafeInteger(p.withdrawFreeDailyLimit)).toBe(true);
            expect(p.withdrawFreeDailyLimit).toBeGreaterThan(0);

            expect(typeof p.overTransferFeePercent).toBe('number');
            expect(p.overTransferFeePercent).toBeGreaterThanOrEqual(0);
            expect(p.overTransferFeePercent).toBeLessThan(0.5);

            expect(typeof p.overWithdrawFeePercent).toBe('number');
            expect(p.overWithdrawFeePercent).toBeGreaterThanOrEqual(0);
            expect(p.overWithdrawFeePercent).toBeLessThan(0.5);

            expect(typeof p.cashbackPercent).toBe('number');
            expect(p.cashbackPercent).toBeGreaterThanOrEqual(0);
            expect(p.cashbackPercent).toBeLessThan(0.2);
        }
    });

    test('монотонность по возрастанию id: плата и лимиты растут, комиссии и кэшбэк — по смыслу', () => {
        for (let i = 1; i < planIds.length; i++) {
            const prev = CardPlans[planIds[i - 1]];
            const cur = CardPlans[planIds[i]];

            expect(cur.dailyFee).toBeGreaterThanOrEqual(prev.dailyFee);
            expect(cur.transferDailyLimit).toBeGreaterThan(prev.transferDailyLimit);
            expect(cur.withdrawFreeDailyLimit).toBeGreaterThan(prev.withdrawFreeDailyLimit);
            expect(cur.overTransferFeePercent).toBeLessThanOrEqual(prev.overTransferFeePercent);
            expect(cur.overWithdrawFeePercent).toBeLessThanOrEqual(prev.overWithdrawFeePercent);
            expect(cur.cashbackPercent).toBeGreaterThanOrEqual(prev.cashbackPercent);
        }
    });
});

describe('DepositConfig', () => {
    test('лимит активных вкладов положительный', () => {
        expect(Number.isSafeInteger(DepositConfig.maxActiveDeposits)).toBe(true);
        expect(DepositConfig.maxActiveDeposits).toBeGreaterThan(0);
    });

    test('гибкий вклад: маленький %/час, положительный период и минимум', () => {
        const f = DepositConfig.flexible;
        expect(typeof f.ratePerHour).toBe('number');
        expect(f.ratePerHour).toBeGreaterThan(0);
        expect(f.ratePerHour).toBeLessThan(0.001);
        expect(Number.isSafeInteger(f.periodMs)).toBe(true);
        expect(f.periodMs).toBeGreaterThan(0);
        expect(Number.isSafeInteger(f.minPrincipal)).toBe(true);
        expect(f.minPrincipal).toBeGreaterThan(0);
        expect(Number.isSafeInteger(f.maxCatchupPeriods)).toBe(true);
        expect(f.maxCatchupPeriods).toBeGreaterThan(0);
    });

    test('замороженный вклад: штраф в диапазоне, минимум, cap офлайна', () => {
        const z = DepositConfig.frozen;
        expect(typeof z.earlyPenaltyPercent).toBe('number');
        expect(z.earlyPenaltyPercent).toBeGreaterThanOrEqual(0);
        expect(z.earlyPenaltyPercent).toBeLessThanOrEqual(1);
        expect(Number.isSafeInteger(z.minPrincipal)).toBe(true);
        expect(z.minPrincipal).toBeGreaterThan(DepositConfig.flexible.minPrincipal);
        expect(Number.isSafeInteger(z.maxCatchupPeriods)).toBe(true);
        expect(z.maxCatchupPeriods).toBeGreaterThan(0);
    });

    test('tiers замороженного отсортированы по days, ratePerDay растёт, ставки в разумных пределах', () => {
        const tiers = DepositConfig.frozen.tiers;
        expect(Array.isArray(tiers)).toBe(true);
        expect(tiers.length).toBeGreaterThanOrEqual(1);

        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            expect(Number.isSafeInteger(t.days)).toBe(true);
            expect(t.days).toBeGreaterThan(0);
            expect(typeof t.ratePerDay).toBe('number');
            expect(t.ratePerDay).toBeGreaterThan(0);
            expect(t.ratePerDay).toBeLessThan(0.05);
            if (i > 0) {
                expect(t.days).toBeGreaterThan(tiers[i - 1].days);
                expect(t.ratePerDay).toBeGreaterThanOrEqual(tiers[i - 1].ratePerDay);
            }
        }
    });
});

describe('BankConfig.settlement', () => {
    test('суточный период и положительные caps', () => {
        const s = BankConfig.settlement;
        expect(Number.isSafeInteger(s.periodMs)).toBe(true);
        expect(s.periodMs).toBe(24 * 60 * 60 * 1000);
        expect(Number.isSafeInteger(s.cashbackMaxCatchupPeriods)).toBe(true);
        expect(s.cashbackMaxCatchupPeriods).toBeGreaterThan(0);
        expect(s.cashbackMaxCatchupPeriods).toBeLessThanOrEqual(30);
        expect(Number.isSafeInteger(s.feeMaxCatchupPeriods)).toBe(true);
        expect(s.feeMaxCatchupPeriods).toBeGreaterThan(0);
        expect(Number.isSafeInteger(s.basePlanId)).toBe(true);
        expect(CardPlans[s.basePlanId]).toBeDefined();
    });

    test('legacy-проценты карты выключены (карта = хранилище + кэшбэк)', () => {
        expect(BankConfig.interest.enabled).toBe(false);
    });
});
