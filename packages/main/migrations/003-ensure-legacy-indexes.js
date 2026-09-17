'use strict';
const { ensureIndex, dropIndexIfExists } = require('../core/migrationHelpers');

module.exports = {
    async up(queryInterface) {
        const seq = queryInterface.sequelize;
        await ensureIndex(seq, 'items', ['owner_id'], { name: 'idx_items_owner' });
        await ensureIndex(seq, 'vehicles', ['owner_id'], { name: 'idx_vehicles_owner' });
        await ensureIndex(seq, 'audit_logs', ['actor_id'], { name: 'idx_audit_actor' });
        await ensureIndex(seq, 'audit_logs', ['created_at'], { name: 'idx_audit_created' });
        await ensureIndex(seq, 'audit_logs', ['category'], { name: 'idx_audit_category' });
    },
    async down(queryInterface) {
        const seq = queryInterface.sequelize;
        await dropIndexIfExists(seq, 'items', 'idx_items_owner');
        await dropIndexIfExists(seq, 'vehicles', 'idx_vehicles_owner');
        await dropIndexIfExists(seq, 'audit_logs', 'idx_audit_actor');
        await dropIndexIfExists(seq, 'audit_logs', 'idx_audit_created');
        await dropIndexIfExists(seq, 'audit_logs', 'idx_audit_category');
    },
};
