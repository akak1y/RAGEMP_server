const { Sequelize } = require('sequelize');
const mysql = require('mysql2');

let settings = {};
try { settings = require('../settings.json') } catch {}

function getDbConfig() {
    const bd = settings.bd || {};
    const rawDbName = process.env.DB_NAME || bd.name || 'ragemp_server';
    if (!/^[a-zA-Z0-9_]+$/.test(rawDbName)) throw new Error('[Sequelize] Некорректное имя БД (допустимы буквы, цифры, _)');
    return {
        host: process.env.DB_HOST || bd.host || 'localhost',
        port: Number(process.env.DB_PORT || bd.port || 3306),
        user: process.env.DB_USER || bd.user || 'root',
        password: process.env.DB_PASSWORD || bd.password || '',
        name: rawDbName
    }
}

let sequelizeInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const cfg = getDbConfig();

        const connection = mysql.createConnection({
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            password: cfg.password,
            multipleStatements: true
        });

        const initDbQueries = `
            CREATE DATABASE IF NOT EXISTS ${cfg.name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            USE ${cfg.name};
        `;

        connection.query(initDbQueries, (err) => {
            if (err) return reject(err);
            connection.end();

            try {
                sequelizeInstance = new Sequelize(cfg.name, cfg.user, cfg.password, {
                    host: cfg.host,
                    port: cfg.port,
                    dialect: 'mysql',
                    dialectModule: mysql,
                    logging: false,
                    pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
                    dialectOptions: { multipleStatements: true }
                });
                console.log(`[Sequelize] Подключено к ${cfg.name}`);
                resolve(sequelizeInstance);
            } catch (syncErr) {
                console.error(`[Sequelize Init Error]: ${syncErr.message}`);
                reject(syncErr);
            }
        });
    });
}

module.exports = {
    initDB,
    getSequelize: () => sequelizeInstance,
    getDbConfig // для интеграционных тестов
};