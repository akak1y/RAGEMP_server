'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING, FLOAT, TEXT, DATE, BOOLEAN } = Sequelize;

        await queryInterface.createTable('accounts', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            username: { type: STRING(32), allowNull: false, unique: true },
            password: { type: STRING(255), allowNull: false },
            hwid: { type: STRING(255), defaultValue: '' },
            money: { type: INTEGER, defaultValue: 50000 },
            admin_level: { type: INTEGER, defaultValue: 0 },
            pos_x: { type: FLOAT, defaultValue: -2183.0 },
            pos_y: { type: FLOAT, defaultValue: 4268.0 },
            pos_z: { type: FLOAT, defaultValue: 48.0 },
        });

        await queryInterface.createTable('items', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            owner_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            item_id: { type: STRING(50), allowNull: false },
            count: { type: INTEGER, allowNull: false, defaultValue: 1 },
            slot: { type: INTEGER, allowNull: false },
        });

        await queryInterface.createTable('vehicles', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            owner_id: {
                type: INTEGER,
                allowNull: false,
                references: { model: 'accounts', key: 'id' },
                onDelete: 'CASCADE',
            },
            model: { type: STRING(50), allowNull: false },
            color_r: { type: INTEGER, defaultValue: 255 },
            color_g: { type: INTEGER, defaultValue: 255 },
            color_b: { type: INTEGER, defaultValue: 255 },
            engine_mod: { type: INTEGER, allowNull: true, defaultValue: -1 },
            wheel_type: { type: INTEGER, allowNull: true, defaultValue: 0 },
            wheel_mod: { type: INTEGER, allowNull: true, defaultValue: -1 },
            brakes_mod: { type: INTEGER, allowNull: true, defaultValue: -1 },
            transmission_mod: { type: INTEGER, allowNull: true, defaultValue: -1 },
            turbo_mod: { type: INTEGER, allowNull: true, defaultValue: -1 },
            fuel: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 100.0 },
        });

        await queryInterface.createTable('audit_logs', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            category: { type: STRING(255), defaultValue: 'system' },
            action: { type: STRING(255), allowNull: false },
            actor: { type: STRING(255), allowNull: false },
            actor_id: { type: INTEGER, allowNull: true },
            target: { type: STRING(255), allowNull: true },
            amount: { type: INTEGER, allowNull: true },
            repeats: { type: INTEGER, allowNull: true },
            success: { type: BOOLEAN, defaultValue: true },
            ip: { type: STRING(255), allowNull: true },
            hwid: { type: STRING(255), allowNull: true },
            details: { type: TEXT, allowNull: true },
            created_at: { type: DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
        await queryInterface.addIndex('audit_logs', ['category']);
        await queryInterface.addIndex('audit_logs', ['actor_id']);
        await queryInterface.addIndex('audit_logs', ['created_at']);

        await queryInterface.createTable('bots', {
            id: { type: INTEGER, autoIncrement: true, primaryKey: true },
            name: { type: STRING(255), allowNull: false, unique: true },
            account_id: { type: INTEGER, allowNull: true },
            position: { type: STRING(255), allowNull: true },
            active: { type: BOOLEAN, defaultValue: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('bots');
        await queryInterface.dropTable('audit_logs');
        await queryInterface.dropTable('vehicles');
        await queryInterface.dropTable('items');
        await queryInterface.dropTable('accounts');
    },
};
