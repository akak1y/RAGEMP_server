const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');
let FactionStorageItem = null;
function initFactionStorageItemModel() {
    if (FactionStorageItem) return FactionStorageItem;
    const sequelize = getSequelize();
    if (!sequelize)
        throw new Error('[FactionStorageItem] Sequelize не инициализирован — сначала initDB');
    FactionStorageItem = sequelize.define(
        'FactionStorageItem',
        {
            faction_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'factions', key: 'id' },
                onDelete: 'CASCADE',
            },
            item_id: { type: DataTypes.STRING(50), allowNull: false },
            count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            slot: { type: DataTypes.INTEGER, allowNull: false },
        },
        { tableName: 'faction_storage_items', timestamps: false }
    );
    return FactionStorageItem;
}
function getFactionStorageItemModel() {
    if (!FactionStorageItem) initFactionStorageItemModel();
    return FactionStorageItem;
}
module.exports = {
    initFactionStorageItemModel,
    getFactionStorageItemModel,
    getModel: getFactionStorageItemModel,
};