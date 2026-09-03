const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');

let FactionMember = null;

function getFactionMemberModel() {
    if (FactionMember) return FactionMember;
    FactionMember = getSequelize().define(
        'faction_member',
        {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            faction_id: { type: DataTypes.INTEGER, allowNull: false },
            account_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
            rank: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        },
        { tableName: 'faction_members', timestamps: true, createdAt: 'joined_at', updatedAt: false }
    );
    return FactionMember;
}

module.exports = { getFactionMemberModel };
