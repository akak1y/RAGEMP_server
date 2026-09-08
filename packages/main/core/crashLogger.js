const fs = require('fs');
const path = require('path');

const CRASH_LOG = path.join(__dirname, '..', 'crash.log');

/**
 * Записывает стек ошибки в файл для отладки крашей
 */
function writeCrashLog(err) {
    try {
        fs.appendFileSync(
            CRASH_LOG,
            `\n${new Date().toISOString()}\n${err.stack || err.message}\n`
        );
    } catch (e) {}
}

module.exports = { writeCrashLog };
