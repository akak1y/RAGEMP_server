let settings = {};
try { settings = require('./settings.json') } catch {}

function getConfig() {
    const bd = settings.bd || {};
    return {
        username: process.env.DB_USER || bd.user || 'root',
        password: process.env.DB_PASSWORD || bd.password || '',
        database: process.env.DB_NAME || bd.name || 'ragemp_server',
        host: process.env.DB_HOST || bd.host || 'localhost',
        dialect: 'mysql'
    };
}

module.exports = {
    development: getConfig(),
    test: getConfig()
}