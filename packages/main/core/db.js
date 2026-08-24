const { Sequelize } = require('sequelize');
const mysql = require('mysql2');

let settings = {};
try {
    settings = require('../settings.json');
} catch {}

function getDbConfig() {
    const bd = settings.bd || {};
    const rawDbName = process.env.DB_NAME || bd.name || 'ragemp_server';
    if (!/^[a-zA-Z0-9_]+$/.test(rawDbName))
        throw new Error('[Sequelize] Некорректное имя БД (допустимы буквы, цифры, _)');
    return {
        host: process.env.DB_HOST || bd.host || '127.0.0.1',
        port: Number(process.env.DB_PORT || bd.port || 3306),
        user: process.env.DB_USER || bd.user || 'root',
        password: process.env.DB_PASSWORD || bd.password || '',
        name: rawDbName,
        connectTimeout: 10000,
    };
}

let sequelizeInstance = null;

/**
 * Ждём MySQL: до 5 попыток
 */
function waitForMySQL(cfg, maxRetries = 5) {
    return new Promise((resolve, reject) => {
        let attempt = 0;

        const tryConnect = () => {
            attempt++;
            const connection = mysql.createConnection({
                host: cfg.host,
                port: cfg.port,
                user: cfg.user,
                password: cfg.password,
                connectTimeout: cfg.connectTimeout,
            });

            connection.connect((err) => {
                try {
                    connection.end();
                } catch (e) {}

                if (!err) return resolve();

                if (attempt >= maxRetries) {
                    return reject(
                        new Error(`MySQL недоступен после ${attempt} попыток: ${err.message}`)
                    );
                }

                const delay = Math.pow(2, attempt) * 1000;
                console.log(
                    `[Sequelize] MySQL недоступен (попытка ${attempt}/${maxRetries}): ${err.message}. Повтор через ${delay / 1000}с...`
                );
                setTimeout(tryConnect, delay);
            });
        };

        tryConnect();
    });
}

async function initDB() {
    const cfg = getDbConfig();

    await waitForMySQL(cfg);

    await new Promise((resolve, reject) => {
        const connection = mysql.createConnection({
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            password: cfg.password,
            multipleStatements: true,
            connectTimeout: cfg.connectTimeout,
        });

        connection.query(
            `CREATE DATABASE IF NOT EXISTS ${cfg.name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE ${cfg.name};`,
            (err) => {
                connection.end();
                if (err) return reject(err);
                resolve();
            }
        );
    });

    sequelizeInstance = new Sequelize(cfg.name, cfg.user, cfg.password, {
        host: cfg.host,
        port: cfg.port,
        dialect: 'mysql',
        dialectModule: mysql,
        logging: false,
        pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
        dialectOptions: { multipleStatements: true },
    });

    await sequelizeInstance.authenticate();
    console.log(`[Sequelize] Подключено к ${cfg.name}`);
    return sequelizeInstance;
}

module.exports = {
    initDB,
    getSequelize: () => sequelizeInstance,
    getDbConfig, // для интеграционных тестов
};
