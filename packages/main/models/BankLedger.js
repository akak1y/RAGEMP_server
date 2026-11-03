const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');

let BankLedger = null;

function initBankLedgerModel() {
    if (BankLedger) return BankLedger;

    const sequelize = getSequelize();
    if (!sequelize) {
        throw new Error('[BankLedger] Sequelize не инициализирован — сначала initDB');
    }

    BankLedger = sequelize.define(
        'BankLedger',
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
            type: {
                type: DataTypes.STRING(32),
                allowNull: false,
            },
            amount: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            balance_after: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            reference_id: {
                type: DataTypes.STRING(36),
                allowNull: true,
            },
            period_key: {
                type: DataTypes.STRING(32),
                allowNull: true,
            },
            reason: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            meta: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            tableName: 'bank_ledger',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: false,
            indexes: [
                { fields: ['account_id', 'created_at'] },
                { fields: ['reference_id'] },
                {
                    unique: true,
                    fields: ['account_id', 'type', 'period_key'],
                    name: 'bank_ledger_interest_period_unique',
                },
                {
                    unique: true,
                    fields: ['reference_id', 'account_id', 'type'],
                    name: 'bank_ledger_transfer_leg_unique',
                },
            ],
        }
    );

    return BankLedger;
}

function getBankLedgerModel() {
    if (!BankLedger) initBankLedgerModel();
    return BankLedger;
}

module.exports = {
    initBankLedgerModel,
    getBankLedgerModel,
    getModel: getBankLedgerModel,
};
