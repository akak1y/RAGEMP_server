require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.test') });
const { Sequelize } = require('sequelize');

module.exports = async () => {
    console.log('🧹 Очистка тестовой БД...');
    try {
        const sequelize = new Sequelize(
            process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD,
            { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), dialect: 'mysql', logging: false }
        );
        await sequelize.sync({ force: true });
        await sequelize.close();
        console.log('БД очищена');
    } catch (err) { console.error('Ошибка очистки:', err.message) }
};