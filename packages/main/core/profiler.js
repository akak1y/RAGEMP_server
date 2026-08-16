const { performance } = require('perf_hooks');
const logger = require('./logger');

/**
 * Профилирование асинхронных операций
 * @param {string} label - Имя операции для логов
 * @param {Function} fn - Асинхронная функция
 * @returns {Promise<any>} - Время выполнения функции
 */
async function profile(label, fn) {
    const start = performance.now();
    try {
        const result = await fn();
        const duration = performance.now() - start;
        
        logger.info(label + " выполнена успешно за " + duration.toFixed(3) + " мс");
        return result
    } catch (error) {
        const duration = performance.now() - start;
        logger.error(label + " РУХНУЛА через " + duration.toFixed(3) + " мс. Причина: " + error.message + "\nStack: " + error.stack);
        throw error
    }
}

module.exports = profile