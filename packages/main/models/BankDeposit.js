const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');

let BankDeposit = null;

function initBankDepositModel() {
    if (BankDeposit) return BankDeposit;

    const sequelize = getSequelize();
    if (!sequelize) {
        throw new Error('[BankDeposit] Sequelize не инициализирован — сначала initDB');
    }

    BankDeposit = sequelize.define(
        'BankDeposit',
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            account_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            kind: {
                type: DataTypes.STRING(16),
                allowNull: false,
            },
            principal: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            balance: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            rate_per_period: {
                type: DataTypes.DOUBLE,
                allowNull: false,
            },
            period_ms: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            opened_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            last_accrued_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            matures_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            status: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: 'active',
            },
            early_penalty_percent: {
                type: DataTypes.DOUBLE,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: 'bank_deposits',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            indexes: [
                { fields: ['account_id', 'status'] },
                { fields: ['account_id', 'matures_at'] },
                { fields: ['account_id', 'kind'] },
            ],
        }
    );

    return BankDeposit;
}

function getBankDepositModel() {
    if (!BankDeposit) initBankDepositModel();
    return BankDeposit;
}

module.exports = {
    initBankDepositModel,
    getBankDepositModel,
    getModel: getBankDepositModel,
};
