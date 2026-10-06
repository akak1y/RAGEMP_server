const logger = require('./logger');

const RING_SIZE = 200;
const ring = [];
let listener = null;

/**
 * Кольцевой буфер последних событий сервер→клиент.
 */
function push(record) {
    ring.push(record);
    if (ring.length > RING_SIZE) ring.shift();

    if (listener) {
        try {
            listener(record);
        } catch (err) {
            logger.error(`[EventLog] Ошибка слушателя журнала: ${err.message}`);
        }
    }
}

function subscribe(fn) {
    listener = fn;
    return () => {
        listener = null;
    };
}

function getRecent(limit = 50) {
    return ring.slice(-limit);
}

module.exports = { push, subscribe, getRecent };
