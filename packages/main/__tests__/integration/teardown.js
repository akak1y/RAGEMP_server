require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.test') });
const mysql = require('mysql2');
const { createClient } = require('redis');

module.exports = async () => {
    console.log('🧹 Очистка тестовой БД...');
    try {
        const conn = mysql.createConnection({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });
        await new Promise((resolve, reject) => {
            conn.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``, (err) => {
                conn.end();
                if (err) reject(err); else resolve();
            });
        });
        console.log('✅ MySQL очищена (БД удалена)');
    } catch (err) { console.error('❌ Ошибка очистки MySQL:', err.message) }

    try {
        const client = createClient({
            url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}/${process.env.REDIS_DB || 1}`
        });
        await client.connect();
        await client.flushDb();
        await client.quit();
        console.log('✅ Redis очищен');
    } catch (err) { console.error('❌ Ошибка очистки Redis:', err.message) }
};