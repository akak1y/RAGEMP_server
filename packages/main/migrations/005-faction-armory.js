'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING, DATE } = Sequelize;
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
        await queryInterface.addIndex(
            'faction_armory_loans',
            ['faction_id', 'account_id', 'item_id'],
            { unique: true }
        );
        await queryInterface.addIndex('faction_armory_loans', ['account_id']);
    },
    async down(queryInterface) {
        await queryInterface.dropTable('faction_armory_loans');
    },
};
