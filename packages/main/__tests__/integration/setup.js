const { execSync } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

if (!process.env.DB_NAME) throw new Error('Не найден DB_NAME: проверь packages/main/.env.test');

module.exports = async () => {
    console.log(`Миграции в ${process.env.DB_NAME}...`);
    execSync('npm run migrate', {
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'inherit',
        env: { ...process.env }
    });
    console.log('Миграции применены');
};