const { DataTypes } = require('sequelize');
const { getSequelize } = require('../db.js');

let Item = null;

function initItemModel() {
    if (Item) return Item; // защита от дублирования

    const sequelize = getSequelize();
    if (!sequelize) throw new Error('[Item] Sequelize не инициализирован — сначала initDB');

    Item = sequelize.define('Item', {
        owner_id: { type: DataTypes.INTEGER, allowNull: false },
        item_id: { type: DataTypes.STRING(50), allowNull: false },
        count: { type: DataTypes.INTEGER, defaultValue: 1 },
        slot: { type: DataTypes.INTEGER, allowNull: false }
    }, { tableName: 'items', timestamps: false });
    return Item
}

module.exports = {
    initItemModel,
    getItemModel: () => {
        if (!Item) { initItemModel() } // если по какой-то причине не создана модель -> создаёт
        return Item
    }
}