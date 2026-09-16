const armoryService = require('../services/ArmoryService');
const factionService = require('../services/FactionService');
const factionStorageService = require('../services/FactionStorageService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { MafiaBasePos, FactionStorageConfig, ArmoryConfig } = require('../config');
const { isNear } = require('../utils/distance');
const { sendEvent } = require('../core/eventSender');

/**
 * Арсенал семьи: займы стволов из семейного склада.
 * Доступен только у базы.
 */
const ERROR_TEXT = {
    not_member: 'Вы не состоите в семье',
    too_far: 'Арсенал доступен только у базы семьи',
    no_rank: 'Ваш ранг не может брать из арсенала',
    not_armory_item: 'Под займ выдаются только семейные стволы',
    loan_limit: 'Достигнут лимит займов — сначала верните долг',
    no_loan: 'У вас нет такого займа',
    not_enough_items: 'Недостаточно на складе или в инвентаре',
    inventory_full: 'В инвентаре нет места',
    storage_full: 'Семейный склад заполнен',
    invalid_amount: 'Некорректное количество',
    db_error: 'Ошибка базы данных',
};

/**
 * Состояние арсенала: стволы склада + займы игрока..
 */
async function sendArmoryInfo(player) {
    const membership = await factionService.getMembership(player.accountId);
    if (
        !membership ||
        !isNear(player.position, MafiaBasePos, FactionStorageConfig.interactRadius)
    ) {
        return sendEvent(player, 'client:armory:setInfo', ['null']);
    }
    const [storage, loans] = await Promise.all([
        factionStorageService.getView(membership.faction.id, membership.member.rank),
        armoryService.listLoans(player.accountId),
    ]);
    sendEvent(player, 'client:armory:setInfo', [
        JSON.stringify({
            canTake: membership.member.rank >= ArmoryConfig.minRankTake,
            maxLoans: ArmoryConfig.maxLoansPerMember,
            weapons: storage.items.filter((i) => armoryService.isArmoryItem(i.itemId)),
            loans,
        }),
    ]);
}

mp.events.add(
    'server:armory:request',
    withGuards(
        [isLoggedIn, rateLimit('armory:request', 3, 10)],
        async (player) => {
            await sendArmoryInfo(player);
        },
        'armory:request'
    )
);

mp.events.add(
    'server:armory:take',
    withGuards(
        [isLoggedIn, rateLimit('armory:take', 5, 5)],
        async (player, itemId, amount) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership)
                return sendEvent(player, 'client:armory:result', [false, ERROR_TEXT.not_member]);
            if (membership.member.rank < ArmoryConfig.minRankTake)
                return sendEvent(player, 'client:armory:result', [false, ERROR_TEXT.no_rank]);
            if (!isNear(player.position, MafiaBasePos, FactionStorageConfig.interactRadius))
                return sendEvent(player, 'client:armory:result', [false, ERROR_TEXT.too_far]);
            const result = await armoryService.take(
                player,
                membership.faction.id,
                String(itemId),
                Number(amount)
            );
            if (!result.success)
                return sendEvent(player, 'client:armory:result', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            sendEvent(player, 'client:armory:result', [true, 'Ствол взят под займ']);
            await sendArmoryInfo(player);
        },
        'armory:take'
    )
);

mp.events.add(
    'server:armory:return',
    withGuards(
        [isLoggedIn, rateLimit('armory:return', 5, 5)],
        async (player, itemId, amount) => {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership)
                return sendEvent(player, 'client:armory:result', [false, ERROR_TEXT.not_member]);
            if (!isNear(player.position, MafiaBasePos, FactionStorageConfig.interactRadius))
                return sendEvent(player, 'client:armory:result', [false, ERROR_TEXT.too_far]);
            const result = await armoryService.returnItem(
                player,
                membership.faction.id,
                String(itemId),
                Number(amount)
            );
            if (!result.success)
                return sendEvent(player, 'client:armory:result', [
                    false,
                    ERROR_TEXT[result.error] || result.error,
                ]);
            sendEvent(player, 'client:armory:result', [true, 'Займ возвращён на склад']);
            await sendArmoryInfo(player);
        },
        'armory:return'
    )
);
