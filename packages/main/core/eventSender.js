const { validateEvent } = require('./eventContracts');
const logger = require('./logger');

/**
 * Отправка события игроку с валидацией по контракту.
 */
function sendEvent(player, eventName, args = []) {
    if (!validateEvent(eventName, args)) {
        logger.error(`[EventSender] ${eventName}: отправка отклонена (невалидные аргументы)`);
        return false;
    }
    player.call(eventName, args);
    return true;
}

module.exports = { sendEvent };
