'use strict';
const { ensureIndex } = require('../core/migrationHelpers');

module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING, DATE } = Sequelize;
        const seq = queryInterface.sequelize;
        await queryInterface.createTable('faction_armory_loans', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            faction_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'factions', key: 'id' },
                onDelete: 'CASCADE',
            },
            account_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            item_id: { type: STRING(50), allowNull: false },
            count: { type: INTEGER, allowNull: false, defaultValue: 1 },
            issued_at: { type: DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
        await ensureIndex(seq, 'faction_armory_loans', ['faction_id', 'account_id', 'item_id'], {
            unique: true,
        });
        await ensureIndex(seq, 'faction_armory_loans', ['account_id']);
    },
    async down(queryInterface) {
        await queryInterface.dropTable('faction_armory_loans');
    },
};
