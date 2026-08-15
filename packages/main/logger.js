const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) { fs.mkdirSync(logsDir) } // создаём папку логов если нет

function writeLog(level, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${timestamp}] [${level.toUpperCase()}]: ${message}\n`;

    const logFile = path.join(logsDir, 'combined.log');
    const errorFile = path.join(logsDir, 'error.log');

    fs.appendFile(logFile, logLine, (err) => {
        if (err) console.error(`[Logger] Ошибка записи: ${err.message}`);
    });
    if (level === 'error') {
        fs.appendFile(errorFile, logLine, (err) => {
            if (err) console.error(`[Logger] Ошибка записи error.log: ${err.message}`);
        });
    }
    console.log(`[${level.toUpperCase()}] ${message}`);
}

const logger = {
    info: (msg) => writeLog('info', msg),
    warn: (msg) => writeLog('warn', msg),
    error: (msg) => writeLog('error', msg)
};

module.exports = logger;