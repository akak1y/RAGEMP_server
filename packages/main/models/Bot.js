const { Sequelize } = require('sequelize');
const { getSequelize } = require('../db');

let Bot = null;
let syncPromise = null;

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
    syncPromise = Bot.sync();
}

function getBotModel() {
    if (!Bot) initBotModel();
    return Bot;
}

function ensureBotReady() {
    if (!Bot) initBotModel();
    return syncPromise;
}

module.exports = { initBotModel, getBotModel, ensureBotReady }