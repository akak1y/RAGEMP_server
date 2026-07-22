const { Sequelize } = require('sequelize');
const mysql = require('mysql2');

const dbName = 'ragemp_server';
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'akak',
    multipleStatements: true
});

// автоматическое создание структуры если бд нет
const initDbQueries = `
    CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    USE ${dbName};
    
    CREATE TABLE IF NOT EXISTS accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        hwid VARCHAR(255) DEFAULT '',
        money INT DEFAULT 50000,
        admin_level INT DEFAULT 0,
        pos_x FLOAT DEFAULT -2183.0,
        pos_y FLOAT DEFAULT 4268.0,
        pos_z FLOAT DEFAULT 48.0
    );

    CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        item_id VARCHAR(50) NOT NULL,
        count INT NOT NULL DEFAULT 1,
        slot INT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vehicles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        model VARCHAR(50) NOT NULL,
        color_r INT DEFAULT 255,
        color_g INT DEFAULT 255,
        color_b INT DEFAULT 255,
        FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
`;

let sequelizeInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        connection.query(initDbQueries, async (err) => { 
            if (err) return reject(err); // ошибка на старте
            connection.end(); // закрываем временное подключение

            try {
                sequelizeInstance = new Sequelize(dbName, 'root', 'akak', {
                    host: 'localhost',
                    dialect: 'mysql',
                    dialectModule: mysql,
                    logging: false, // - спам SQL
                    pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
                    dialectOptions: { multipleStatements: true } // для сложных запросов
                });
                console.log('[Sequelize] Подключение и пул ORM успешно инициализированы.');

                await sequelizeInstance.sync({ alter: true }); 
                console.log('[Sequelize] Структура таблиц базы данных успешно синхронизирована с моделями.');

                resolve(sequelizeInstance) // готово
            } catch (syncErr) {
                console.error(`[Sequelize Init Error]: ${syncErr.message}`);
                reject(syncErr) // ошибка
            }
        })
    })
};

module.exports = { 
    initDB,
    getSequelize: () => sequelizeInstance // геттер для вытаскивания подключения к бд
}