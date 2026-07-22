const { DataTypes } = require('sequelize');
const { getSequelize } = require('../db.js');

const Item = getSequelize().define('Item', {
    owner_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.STRING(50), allowNull: false },
    count: { type: DataTypes.INTEGER, defaultValue: 1 },
    slot: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'items', timestamps: false });

module.exports = Item