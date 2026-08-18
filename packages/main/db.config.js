const settings = require('./settings.json');

module.exports = {
    development: {
        username: settings.bd.user,
        password: settings.bd.password,
        database: settings.bd.name,
        host: settings.bd.host,
        dialect: 'mysql'
    }
};