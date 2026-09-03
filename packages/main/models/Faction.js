const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');

let Faction = null;

function getFactionModel() {
    if (Faction) return Faction;
    Faction = getSequelize().define(
        'faction',
        {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            name: { type: DataTypes.STRING, allowNull: false },
            type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'mafia' },
            leader_id: { type: DataTypes.INTEGER, allowNull: true },
            treasury: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        },
        { tableName: 'factions', timestamps: true, createdAt: 'created_at', updatedAt: false }
    );
    return Faction;
}

module.exports = { getFactionModel };
