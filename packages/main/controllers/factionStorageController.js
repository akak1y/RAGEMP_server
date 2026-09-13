const factionService = require('../services/FactionService');
const factionStorageService = require('../services/FactionStorageService');
const auditService = require('../services/AuditService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { MafiaBasePos, FactionStorageConfig } = require('../config');
const { isNear } = require('../utils/distance');
const { sendEvent } = require('../core/eventSender');

/**
 * Семейный склад: просмотр у базы, deposit/withdraw с проверкой ранга и дистанции.
 */
const ERROR_TEXT = {
    not_member: 'Вы не состоите в семье',
    too_far: 'Склад доступен только у базы семьи',
    no_permission: 'Недостаточно ранга для этого действия',
    storage_full: 'Склад заполнен',
    not_enough_items: 'На складе нет такого количества',
    inventory_full: 'В инвентаре нет места',
    item_not_in_config: 'Неизвестный предмет',
    invalid_amount: 'Некорректное количество',
    storage_race: 'Склад изменился одновременно с вами — повторите',
    db_error: 'Ошибка базы данных',
};

/**
 * Состояние склада: только члену семьи у базы, иначе 'null' (секция скрыта в UI)
 */
async function sendStorageInfo(player) {
    const membership = await factionService.getMembership(player.accountId);
    if (
        !membership ||
        !isNear(player.position, MafiaBasePos, FactionStorageConfig.interactRadius)
    ) {
        return sendEvent(player, 'client:factionStorage:setInfo', ['null']);
    }
    const view = await factionStorageService.getView(membership.faction.id, membership.member.rank);
    sendEvent(player, 'client:factionStorage:setInfo', [JSON.stringify(view)]);
}

mp.events.add(
    'server:factionStorage:request',
    withGuards(
        [isLoggedIn, rateLimit('factionStorage:request', 3, 10)],
        async (player) => {
            await sendStorageInfo(player);
        },
        'factionStorage:request'
    )
);

mp.events.add(
    'server:factionStorage:deposit',
    withGuards(
        [isLoggedIn, rateLimit('factionStorage:deposit', 5, 5)],
        async (player, itemId, amount) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership)
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT.not_member,
                ]);
            if (membership.member.rank < FactionStorageConfig.minRankDeposit)
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT.no_permission,
                ]);
            if (!isNear(player.position, MafiaBasePos, FactionStorageConfig.interactRadius))
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT.too_far,
                ]);
            const qty = Number(amount);
            const result = await factionStorageService.deposit(
                player,
                membership.faction.id,
                String(itemId),
                qty
            );
            if (!result.success)
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            auditService.logPlayer(player, 'faction_storage_deposit', {
                category: 'faction',
                withPosition: true,
                details: { itemId: String(itemId), amount: qty },
            });
            sendEvent(player, 'client:factionStorage:result', [
                true,
                'Предмет положен на склад семьи',
            ]);
            await sendStorageInfo(player);
        },
        'factionStorage:deposit'
    )
);

mp.events.add(
    'server:factionStorage:withdraw',
    withGuards(
        [isLoggedIn, rateLimit('factionStorage:withdraw', 5, 5)],
        async (player, itemId, amount) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership)
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT.not_member,
                ]);
            if (membership.member.rank < FactionStorageConfig.minRankWithdraw)
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT.no_permission,
                ]);
            if (!isNear(player.position, MafiaBasePos, FactionStorageConfig.interactRadius))
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT.too_far,
                ]);
            const qty = Number(amount);
            const result = await factionStorageService.withdraw(
                player,
                membership.faction.id,
                String(itemId),
                qty
            );
            if (!result.success)
                return sendEvent(player, 'client:factionStorage:result', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            auditService.logPlayer(player, 'faction_storage_withdraw', {
                category: 'faction',
                withPosition: true,
                details: { itemId: String(itemId), amount: qty },
            });
            sendEvent(player, 'client:factionStorage:result', [
                true,
                'Предмет взят со склада семьи',
            ]);
            await sendStorageInfo(player);
        },
        'factionStorage:withdraw'
    )
);
