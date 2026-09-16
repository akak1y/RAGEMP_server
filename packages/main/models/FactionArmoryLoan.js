const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');
let FactionArmoryLoan = null;
function initFactionArmoryLoanModel() {
    if (FactionArmoryLoan) return FactionArmoryLoan;
    const sequelize = getSequelize();
    if (!sequelize)
        throw new Error('[FactionArmoryLoan] Sequelize не инициализирован — сначала initDB');
    FactionArmoryLoan = sequelize.define(
        'FactionArmoryLoan',
        {
            faction_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'factions', key: 'id' },
                onDelete: 'CASCADE',
            },
            account_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            item_id: { type: DataTypes.STRING(50), allowNull: false },
            count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            issued_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        },
        {
            tableName: 'faction_armory_loans',
            timestamps: false,
            indexes: [
                { unique: true, fields: ['faction_id', 'account_id', 'item_id'] },
                { fields: ['account_id'] },
            ],
        }
    );
    return FactionArmoryLoan;
}
function getFactionArmoryLoanModel() {
    if (!FactionArmoryLoan) initFactionArmoryLoanModel();
    return FactionArmoryLoan;
}
module.exports = {
    initFactionArmoryLoanModel,
    getFactionArmoryLoanModel,
    getModel: getFactionArmoryLoanModel,
};
