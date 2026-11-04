const bankService = require('../services/BankService');
const auditService = require('../services/AuditService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');
const { humanizeError } = require('../core/errorMessages');
const { isNear } = require('../utils/distance');
const { BankPos, BankInteractionRadius, BankConfig } = require('../config');

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

    sendEvent(player, 'client:bank:setInfo', [
        JSON.stringify({
            ...info,
            recent,
            limits: {
                minOperation: BankConfig.minOperation,
                maxDeposit: BankConfig.maxDeposit,
                maxWithdraw: BankConfig.maxWithdraw,
                maxTransfer: BankConfig.maxTransfer,
                maxBalance: BankConfig.maxBalance,
            },
            interest: BankConfig.interest,
        }),
    ]);
}

// Короткий фидбек об операции (успех/ошибка) в toast окна банка.
function sendBankResult(player, ok, text) {
    sendEvent(player, 'client:bank:result', [!!ok, String(text)]);
}

// Полный список движений для вкладки история.
async function sendBankLedger(player, limit) {
    const rows = await bankService.getLedger(player.accountId, limit);
    sendEvent(player, 'client:bank:ledger', [JSON.stringify(rows)]);
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

// Пополнение счёта.
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
                details: { balanceAfter: result.balance, accrued: result.accrued },
            });

            sendBankResult(player, true, `Пополнение: +$${qty}. Баланс: $${result.balance}.`);
            await sendBankInfo(player);
        },
        'bank:deposit'
    )
);

// Снятие со счёта.
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
                details: { balanceAfter: result.balance, accrued: result.accrued },
            });

            sendBankResult(player, true, `Снятие: -$${qty}. Баланс: $${result.balance}.`);
            await sendBankInfo(player);
        },
        'bank:withdraw'
    )
);

// Перевод между банковскими счетами.
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

            sendBankResult(player, true, `Перевод $${qty} на счёт ${to} выполнен.`);
            await sendBankInfo(player);
        },
        'bank:transfer'
    )
);
