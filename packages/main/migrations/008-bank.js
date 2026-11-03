'use strict';
const { ensureIndex } = require('../core/migrationHelpers');

module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING, DATE, TEXT } = Sequelize;
        const seq = queryInterface.sequelize;

        await queryInterface.createTable('bank_accounts', {
            account_id: {
                type: INTEGER,
                allowNull: false,
                primaryKey: true,
                autoIncrement: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            balance: {
                type: INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            last_accrued_at: {
                type: DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            created_at: {
                type: DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            updated_at: {
                type: DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            },
        });

        await seq.query(`
            INSERT IGNORE INTO bank_accounts (
                account_id,
                balance,
                last_accrued_at,
                created_at,
                updated_at
            )
            SELECT
                id,
                0,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM accounts
        `);

        await queryInterface.createTable('bank_ledger', {
            id: {
                type: INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            account_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            type: {
                type: STRING(32),
                allowNull: false,
            },
            amount: {
                type: INTEGER,
                allowNull: false,
            },
            balance_after: {
                type: INTEGER,
                allowNull: false,
            },
            reference_id: {
                type: STRING(36),
                allowNull: true,
            },
            period_key: {
                type: STRING(32),
                allowNull: true,
            },
            reason: {
                type: STRING(255),
                allowNull: true,
            },
            meta: {
                type: TEXT,
                allowNull: true,
            },
            created_at: {
                type: DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });

        await ensureIndex(seq, 'bank_ledger', ['account_id', 'created_at']);
        await ensureIndex(seq, 'bank_ledger', ['reference_id']);

        await ensureIndex(seq, 'bank_ledger', ['account_id', 'type', 'period_key'], {
            unique: true,
            name: 'bank_ledger_interest_period_unique',
        });

        await ensureIndex(seq, 'bank_ledger', ['reference_id', 'account_id', 'type'], {
            unique: true,
            name: 'bank_ledger_transfer_leg_unique',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('bank_ledger');
        await queryInterface.dropTable('bank_accounts');
    },
};
