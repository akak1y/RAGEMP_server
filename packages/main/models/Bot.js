const { Sequelize } = require('sequelize');
const { getSequelize } = require('../core/db');

let Bot = null;

function initBotModel() {
    const sequelize = getSequelize();
    Bot = sequelize.define('Bot', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: Sequelize.STRING, allowNull: false, unique: true },
        account_id: { type: Sequelize.INTEGER, allowNull: true },
        position: { type: Sequelize.STRING, allowNull: true },
        active: { type: Sequelize.BOOLEAN, defaultValue: true }
    }, {
        tableName: 'bots',
        timestamps: false
    });
}

function getBotModel() {
    if (!Bot) initBotModel();
    return Bot;
}

/**
 * Гарантирует, что модель определена
 */
function ensureBotReady() {
    if (!Bot) initBotModel();
    return Promise.resolve();
}

module.exports = { initBotModel, getBotModel, ensureBotReady }