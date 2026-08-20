const mysql = require('mysql2');
const env = require('../db.config.js').development;

const conn = mysql.createConnection({
    host: env.host,
    port: env.port,
    user: env.username || env.user,
    password: env.password
});

conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    (err) => {
        conn.end();
        if (err) {
            console.error('[ensure-db]', err.message);
            process.exit(1);
        }
        console.log(`[ensure-db] БД "${env.database}" готова`);
    }
);