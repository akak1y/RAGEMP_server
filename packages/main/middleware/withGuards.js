const logger = require('../core/logger');
const metrics = require('../core/metrics');

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
            if (!(await guard(player))) return;
        }
        metrics.inc('rage_events_processed_total', 'Game events processed by handlers');
        try {
            await handler(player, ...args);
        } catch (err) {
            metrics.inc('rage_handler_errors_total', 'Errors caught by error boundary');
            logger.error(`[Handler ${label}] ${err.message}`);
        }
    };
}

module.exports = withGuards;
