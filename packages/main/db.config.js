const settings = require('./settings.json');

function getConfig() {
    return {
        username: process.env.DB_USER || settings.bd.user,
        password: process.env.DB_PASSWORD || settings.bd.password,
        database: process.env.DB_NAME || settings.bd.name,
        host: process.env.DB_HOST || settings.bd.host,
        dialect: 'mysql'
    };
}

module.exports = {
    development: getConfig(),
    test: getConfig()
}