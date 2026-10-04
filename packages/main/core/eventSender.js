const { validateEvent } = require('./eventContracts');
const eventLog = require('./eventLog');
const logger = require('./logger');

/**
 * Отправка события игроку с валидацией по контракту.
 */
function describePlayer(player) {
    if (!player) return '?';
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
    if (!player || typeof player.call !== 'function') {
        logger.error(`[EventSender] ${eventName}: игрок недоступен для отправки события`);
        return false;
    }
    try {
        player.call(eventName, args);
        return true;
    } catch (err) {
        logger.error(
            `[EventSender] ${eventName}: не удалось доставить событие ${describePlayer(player)}: ${err.message}`
        );
        return false;
    }
}

module.exports = { sendEvent };
