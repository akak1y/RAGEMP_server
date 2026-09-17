'use strict';

async function ensureIndex(sequelize, table, columns, options = {}) {
    const { unique = false, name } = options;
    const [rows] = await sequelize.query(
        `SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ?
         GROUP BY index_name`,
        { replacements: [table] }
    );
    const wanted = columns.join(',');
    if (rows.some((r) => r.cols === wanted)) return;
    const indexName = name || `${table}_${columns.join('_')}${unique ? '_unique' : ''}`;
    await sequelize.query(
        `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${indexName} ON ${table} (${columns.join(', ')})`
    );
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const { INTEGER, STRING } = Sequelize;
        const seq = queryInterface.sequelize;
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
        await ensureIndex(seq, 'faction_storage_items', ['faction_id']);
    },
    async down(queryInterface) {
        await queryInterface.dropTable('faction_storage_items');
    },
};
