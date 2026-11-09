const { DataTypes } = require('sequelize');
const { getSequelize } = require('../core/db');

let BankAccount = null;

function initBankAccountModel() {
    if (BankAccount) return BankAccount;

    const sequelize = getSequelize();
    if (!sequelize) {
        throw new Error('[BankAccount] Sequelize не инициализирован — сначала initDB');
    }

    BankAccount = sequelize.define(
        'BankAccount',
        {
            account_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
                autoIncrement: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            balance: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            last_accrued_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            plan_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            cashback_pending: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: 'bank_accounts',
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        }
    );

    return BankAccount;
}

function getBankAccountModel() {
    if (!BankAccount) initBankAccountModel();
    return BankAccount;
}

module.exports = {
    initBankAccountModel,
    getBankAccountModel,
    getModel: getBankAccountModel,
};
