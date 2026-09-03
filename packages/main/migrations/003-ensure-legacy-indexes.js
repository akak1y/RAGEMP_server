'use strict';

async function ensureIndex(sequelize, table, indexName, columns) {
    const [rows] = await sequelize.query(
        `SELECT COUNT(1) AS cnt FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        { replacements: [table, indexName] }
    );
    if (Number(rows[0].cnt) > 0) return;
    await sequelize.query(`CREATE INDEX ${indexName} ON ${table} (${columns})`);
}

module.exports = {
    async up(queryInterface) {
        const seq = queryInterface.sequelize;
        await ensureIndex(seq, 'items', 'idx_items_owner', 'owner_id');
        await ensureIndex(seq, 'vehicles', 'idx_vehicles_owner', 'owner_id');
        await ensureIndex(seq, 'audit_logs', 'idx_audit_actor', 'actor_id');
        await ensureIndex(seq, 'audit_logs', 'idx_audit_created', 'created_at');
        await ensureIndex(seq, 'audit_logs', 'idx_audit_category', 'category');
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('items', 'idx_items_owner');
        await queryInterface.removeIndex('vehicles', 'idx_vehicles_owner');
        await queryInterface.removeIndex('audit_logs', 'idx_audit_actor');
        await queryInterface.removeIndex('audit_logs', 'idx_audit_created');
        await queryInterface.removeIndex('audit_logs', 'idx_audit_category');
    },
};
