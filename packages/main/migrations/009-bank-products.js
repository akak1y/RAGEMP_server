'use strict';
const { ensureIndex } = require('../core/migrationHelpers');

module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING, DATE, DOUBLE } = Sequelize;
        const seq = queryInterface.sequelize;

        await queryInterface.addColumn('bank_accounts', 'plan_id', {
            type: INTEGER,
            allowNull: false,
            defaultValue: 1,
        });
        await queryInterface.addColumn('bank_accounts', 'cashback_pending', {
            type: INTEGER,
            allowNull: false,
            defaultValue: 0,
        });
        await queryInterface.createTable('bank_deposits', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            account_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            kind: { type: STRING(16), allowNull: false },
            principal: { type: INTEGER, allowNull: false },
            balance: { type: INTEGER, allowNull: false },
            rate_per_period: { type: DOUBLE, allowNull: false },
            period_ms: { type: INTEGER, allowNull: false },
            opened_at: {
                type: DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            last_accrued_at: {
                type: DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
            matures_at: { type: DATE, allowNull: true },
            status: {
                type: STRING(16),
                allowNull: false,
                defaultValue: 'active',
            },
            early_penalty_percent: { type: DOUBLE, allowNull: false, defaultValue: 0 },
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

        await ensureIndex(seq, 'bank_deposits', ['account_id', 'status']);
        await ensureIndex(seq, 'bank_deposits', ['account_id', 'matures_at']);
        await ensureIndex(seq, 'bank_deposits', ['account_id', 'kind']);

        await queryInterface.addColumn('bank_ledger', 'deposit_id', {
            type: INTEGER,
            allowNull: false,
            defaultValue: 0,
        });

        await seq.query(
            'ALTER TABLE `bank_ledger` DROP INDEX `bank_ledger_interest_period_unique`'
        );
        await ensureIndex(seq, 'bank_ledger', ['account_id', 'type', 'period_key', 'deposit_id'], {
            unique: true,
            name: 'bank_ledger_period_unique',
        });

        await ensureIndex(seq, 'bank_ledger', ['deposit_id', 'created_at']);
        await ensureIndex(seq, 'bank_ledger', ['account_id', 'type', 'created_at']);
    },

    async down(queryInterface, Sequelize) {
        const seq = queryInterface.sequelize;

        await seq.query('ALTER TABLE `bank_ledger` DROP INDEX `bank_ledger_period_unique`');
        await ensureIndex(seq, 'bank_ledger', ['account_id', 'type', 'period_key'], {
            unique: true,
            name: 'bank_ledger_interest_period_unique',
        });
        await queryInterface.removeColumn('bank_ledger', 'deposit_id');

        await queryInterface.dropTable('bank_deposits');

        await queryInterface.removeColumn('bank_accounts', 'cashback_pending');
        await queryInterface.removeColumn('bank_accounts', 'plan_id');
    },
};
