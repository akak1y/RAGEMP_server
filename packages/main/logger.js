const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) { fs.mkdirSync(logsDir) } // создаём папку логов если нет

function writeLog(level, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${timestamp}] [${level.toUpperCase()}]: ${message}\n`;

    fs.appendFileSync(path.join(logsDir, 'combined.log'), logLine);
    if (level === 'error') { fs.appendFileSync(path.join(logsDir, 'error.log'), logLine) } // дублируем ошибку в отдельный файл
    console.log(`[${level.toUpperCase()}] ${message}`)
}

const logger = {
    info: (msg) => writeLog('info', msg),
    warn: (msg) => writeLog('warn', msg),
    error: (msg) => writeLog('error', msg)
};

module.exports = logger;