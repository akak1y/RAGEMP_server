const logger = require('../logger');

/**
 * Оборачивает обработчик mp.events в цепочку middleware + error boundary
 * 
 * @param {Array<Function>} guards - Массив middleware: (player) => boolean
 * @param {Function} handler - Бизнес-логика: async (player, ...args) => {}
 * @param {string} [label] - Имя для логов ошибок
 * @returns {Function} готовый обработчик для mp.events.add
 */
function withGuards(guards, handler, label = '') {
    return async (player, ...args) => {
        for (const guard of guards) {
            if (!guard(player)) return;
        }
        try { await handler(player, ...args) }
        catch (err) { logger.error(`[Handler${label ? ' ' + label : ''}] ${err.message}\nStack: ${err.stack}`) }
    }
}

module.exports = withGuards