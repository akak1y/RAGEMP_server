const bankService = require('../services/BankService');
const auditService = require('../services/AuditService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');
const { humanizeError } = require('../core/errorMessages');
const { isNear } = require('../utils/distance');
const { BankPos, BankInteractionRadius } = require('../config');

/**
 * Банк: открытие окна кассы, пополнение/снятие, перевод между банковскими счетами, история операций.
 *
 */

// Отправить клиенту актуальный снимок счёта + последние 5 движений + лимиты/настройки.
async function sendBankInfo(player) {
    const [info, recent] = await Promise.all([
        bankService.getInfo(player.accountId),
        bankService.getLedger(player.accountId, 5),
    ]);

    sendEvent(player, 'client:bank:setInfo', [JSON.stringify({ ...info, recent })]);
}

// Короткий фидбек об операции (успех/ошибка) в плашку окна.
function sendBankResult(player, ok, text) {
    sendEvent(player, 'client:bank:result', [!!ok, String(text)]);
}

// Полный список движений карты для вкладки история.
async function sendBankLedger(player, limit) {
    const rows = await bankService.getLedger(player.accountId, limit);
    sendEvent(player, 'client:bank:ledger', [JSON.stringify(rows)]);
}

// Список вкладов.
async function sendDeposits(player) {
    const rows = await bankService.getDeposits(player.accountId);
    sendEvent(player, 'client:bank:deposits', [JSON.stringify(rows)]);
}

// Выписка по карте за период.
async function sendStatement(player, fromMs, toMs) {
    const st = await bankService.getStatement(player.accountId, fromMs, toMs);
    sendEvent(player, 'client:bank:statement', [JSON.stringify(st)]);
}

// Открытие окна кассы.
mp.events.add(
    'server:bank:open',
    withGuards(
        [isLoggedIn, rateLimit('bank:open', 3, 10)],
        async (player) => {
            if (!isNear(player.position, BankPos, BankInteractionRadius)) {
                return sendBankResult(player, false, humanizeError('too_far'));
            }

            await bankService.accrueForAccount(player.accountId);
            await sendBankInfo(player);
            sendEvent(player, 'client:bank:open', []);
        },
        'bank:open'
    )
);

// Обновление данных в уже открытом окне.
mp.events.add(
    'server:bank:requestInfo',
    withGuards(
        [isLoggedIn, rateLimit('bank:info', 10, 5)],
        async (player) => {
            await sendBankInfo(player);
        },
        'bank:requestInfo'
    )
);

// История движений.
mp.events.add(
    'server:bank:requestLedger',
    withGuards(
        [isLoggedIn, rateLimit('bank:ledger', 5, 5)],
        async (player, limit) => {
            await sendBankLedger(player, Number(limit) || 20);
        },
        'bank:requestLedger'
    )
);

// Список вкладов.
mp.events.add(
    'server:bank:requestDeposits',
    withGuards(
        [isLoggedIn, rateLimit('bank:deposits', 10, 5)],
        async (player) => {
            await sendDeposits(player);
        },
        'bank:requestDeposits'
    )
);

// Выписка по карте за период.
mp.events.add(
    'server:bank:requestStatement',
    withGuards(
        [isLoggedIn, rateLimit('bank:statement', 5, 5)],
        async (player, fromMs, toMs) => {
            await sendStatement(player, Number(fromMs), Number(toMs));
        },
        'bank:requestStatement'
    )
);

// Пополнение карты.
mp.events.add(
    'server:bank:deposit',
    withGuards(
        [isLoggedIn, rateLimit('bank:deposit', 5, 5)],
        async (player, amount) => {
            if (!isNear(player.position, BankPos, BankInteractionRadius)) {
                return sendBankResult(player, false, humanizeError('too_far'));
            }

            const qty = Number(amount);
            const result = await bankService.deposit(player, qty);

            if (!result.success) {
                return sendBankResult(player, false, humanizeError(result.error));
            }

            await auditService.logPlayer(player, 'bank_deposit', {
                category: 'bank',
                amount: qty,
                success: true,
                withPosition: true,
                details: { balanceAfter: result.balance },
            });

            sendBankResult(player, true, `Пополнение карты: +$${qty}. Баланс: $${result.balance}.`);
            await sendBankInfo(player);
        },
        'bank:deposit'
    )
);

// Снятие с карты.
mp.events.add(
    'server:bank:withdraw',
    withGuards(
        [isLoggedIn, rateLimit('bank:withdraw', 5, 5)],
        async (player, amount) => {
            if (!isNear(player.position, BankPos, BankInteractionRadius)) {
                return sendBankResult(player, false, humanizeError('too_far'));
            }

            const qty = Number(amount);
            const result = await bankService.withdraw(player, qty);

            if (!result.success) {
                return sendBankResult(player, false, humanizeError(result.error));
            }

            await auditService.logPlayer(player, 'bank_withdraw', {
                category: 'bank',
                amount: qty,
                success: true,
                withPosition: true,
                details: { balanceAfter: result.balance },
            });

            sendBankResult(player, true, `Снятие с карты: -$${qty}. Баланс: $${result.balance}.`);
            await sendBankInfo(player);
        },
        'bank:withdraw'
    )
);

// Перевод между картами.
mp.events.add(
    'server:bank:transfer',
    withGuards(
        [isLoggedIn, rateLimit('bank:transfer', 5, 10)],
        async (player, toAccountId, amount) => {
            const to = Number(toAccountId);
            const qty = Number(amount);
            const result = await bankService.transfer(player, to, qty);

            if (!result.success) {
                return sendBankResult(player, false, humanizeError(result.error));
            }

            await auditService.logPlayer(player, 'bank_transfer', {
                category: 'bank',
                amount: qty,
                target: to,
                success: true,
                details: {
                    referenceId: result.referenceId,
                    fromBalance: result.fromBalance,
                    toBalance: result.toBalance,
                },
            });

            sendBankResult(player, true, `Перевод $${qty} на карту ${to} выполнен.`);
            await sendBankInfo(player);
        },
        'bank:transfer'
    )
);

// Смена/оплата своего тарифа. Управление своим счёт.
mp.events.add(
    'server:bank:setPlan',
    withGuards(
        [isLoggedIn, rateLimit('bank:setPlan', 3, 10)],
        async (player, planId) => {
            const result = await bankService.setPlan(player, Number(planId));

            if (!result.success) {
                return sendBankResult(player, false, humanizeError(result.error));
            }

            await auditService.logPlayer(player, 'bank_set_plan', {
                category: 'bank',
                success: true,
                details: {
                    planId: result.plan.id,
                    planName: result.plan.name,
                    unchanged: !!result.unchanged,
                },
            });

            const verb = result.unchanged ? 'Тариф уже активен' : 'Тариф изменён';
            sendBankResult(player, true, `${verb}: ${result.plan.name}.`);
            await sendBankInfo(player);
        },
        'bank:setPlan'
    )
);

// Открытие вклада.
mp.events.add(
    'server:bank:createDeposit',
    withGuards(
        [isLoggedIn, rateLimit('bank:createDeposit', 3, 10)],
        async (player, kind, amount, tierDays) => {
            if (!isNear(player.position, BankPos, BankInteractionRadius)) {
                return sendBankResult(player, false, humanizeError('too_far'));
            }

            const qty = Number(amount);
            const result = await bankService.createDeposit(
                player,
                String(kind),
                qty,
                Number(tierDays)
            );

            if (!result.success) {
                return sendBankResult(player, false, humanizeError(result.error));
            }

            await auditService.logPlayer(player, 'bank_deposit_open', {
                category: 'bank',
                amount: qty,
                success: true,
                withPosition: true,
                details: { depositId: result.deposit.id, kind: result.deposit.kind },
            });

            sendBankResult(player, true, `Вклад ${result.deposit.kind} открыт на $${qty}.`);
            await sendBankInfo(player);
            await sendDeposits(player);
        },
        'bank:createDeposit'
    )
);

// Закрытие вклада.
mp.events.add(
    'server:bank:closeDeposit',
    withGuards(
        [isLoggedIn, rateLimit('bank:closeDeposit', 3, 10)],
        async (player, depositId, early) => {
            if (!isNear(player.position, BankPos, BankInteractionRadius)) {
                return sendBankResult(player, false, humanizeError('too_far'));
            }

            const result = await bankService.closeDeposit(player, Number(depositId), !!early);

            if (!result.success) {
                return sendBankResult(player, false, humanizeError(result.error));
            }

            await auditService.logPlayer(player, 'bank_deposit_close', {
                category: 'bank',
                amount: result.payout,
                success: true,
                withPosition: true,
                details: {
                    depositId: Number(depositId),
                    penalty: result.penalty,
                    early: !!early,
                },
            });

            const penaltyText = result.penalty > 0 ? ` (штраф $${result.penalty})` : '';
            sendBankResult(
                player,
                true,
                `Вклад закрыт, на карту: $${result.payout}${penaltyText}.`
            );
            await sendBankInfo(player);
            await sendDeposits(player);
        },
        'bank:closeDeposit'
    )
);
