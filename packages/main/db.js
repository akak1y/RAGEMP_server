const { Sequelize } = require('sequelize');
const mysql = require('mysql2');
let gConfig = require('./settings.json');

const dbName = 'ragemp_server';
const connection = mysql.createConnection({
    host: gConfig.bd.host,
    user: gConfig.bd.user,
    password: gConfig.bd.password,
    multipleStatements: true
});

// автоматическое создание бд если нет
const initDbQueries = `
    CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    USE ${dbName};
`;

let sequelizeInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        connection.query(initDbQueries, (err) => {
            if (err) return reject(err); // ошибка на старте
            connection.end(); // закрываем временное подключение

            try {
                sequelizeInstance = new Sequelize(dbName, gConfig.bd.user, gConfig.bd.password, {
                    host: gConfig.bd.host,
                    dialect: 'mysql',
                    dialectModule: mysql,
                    logging: false, // - спам SQL
                    pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
                    dialectOptions: { multipleStatements: true } // для сложных запросов
                });
                console.log('[Sequelize] Подключение и пул ORM успешно инициализированы.');
                resolve(sequelizeInstance) // готово
            } catch (syncErr) {
                console.error(`[Sequelize Init Error]: ${syncErr.message}`);
                reject(syncErr) // ошибка
            }
        })
    })
};

/**
 * Синхронизация таблиц со всеми зарегистрированными моделями
 */
async function syncDB() {
    if (!sequelizeInstance) throw new Error('[Sequelize] Сначала initDB');
    await sequelizeInstance.sync({ alter: true });
    console.log('[Sequelize] Структура таблиц базы данных успешно синхронизирована с моделями.');
}

module.exports = { 
    initDB,
    syncDB,
    getSequelize: () => sequelizeInstance // геттер для вытаскивания подключения к бд
}