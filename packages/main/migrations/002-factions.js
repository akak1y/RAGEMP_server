'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING } = Sequelize;

        await queryInterface.createTable('factions', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            name: { type: STRING(255), allowNull: false },
            type: { type: STRING(50), allowNull: false, defaultValue: 'mafia' },
            leader_id: { type: INTEGER, allowNull: true },
            treasury: { type: INTEGER, allowNull: false, defaultValue: 0 },
            created_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });

        await queryInterface.createTable('faction_members', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            faction_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'factions', key: 'id' },
                onDelete: 'CASCADE',
            },
            account_id: { type: INTEGER, allowNull: false, unique: true },
            rank: { type: INTEGER, allowNull: false, defaultValue: 0 },
            joined_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            },
        });

        await queryInterface.addIndex('faction_members', ['faction_id']);
        await queryInterface.addIndex('faction_members', ['account_id']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('faction_members');
        await queryInterface.dropTable('factions');
    },
};
