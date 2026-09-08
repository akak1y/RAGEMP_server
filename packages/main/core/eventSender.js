const { validateEvent } = require('./eventContracts');
const eventLog = require('./eventLog');
const logger = require('./logger');

/**
 * Отправка события игроку с валидацией по контракту.
 */
function describePlayer(player) {
    if (player.accountName) return `${player.accountName}[${player.accountId}]`;
    return player.name || '?';
}

function sendEvent(player, eventName, args = []) {
    const ok = validateEvent(eventName, args);

    eventLog.push({
        time: Date.now(),
        player: describePlayer(player),
        event: eventName,
        args,
        ok,
    });

    if (!ok) {
        logger.error(`[EventSender] ${eventName}: отправка отклонена (невалидные аргументы)`);
        return false;
    }
    player.call(eventName, args);
    return true;
}

module.exports = { sendEvent };
