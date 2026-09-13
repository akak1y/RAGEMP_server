'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING } = Sequelize;
        await queryInterface.createTable('faction_storage_items', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            faction_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'factions', key: 'id' },
                onDelete: 'CASCADE',
            },
            item_id: { type: STRING(50), allowNull: false },
            count: { type: INTEGER, allowNull: false, defaultValue: 1 },
            slot: { type: INTEGER, allowNull: false },
        });
        await queryInterface.addIndex('faction_storage_items', ['faction_id']);
    },
    async down(queryInterface) {
        await queryInterface.dropTable('faction_storage_items');
    },
};
