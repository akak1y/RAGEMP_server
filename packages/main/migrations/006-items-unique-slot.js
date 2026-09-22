'use strict';
const { ensureUniqueIndexGuarded } = require('../core/migrationHelpers');

/**
 * Защита слотов инвентаря на уровне БД: UNIQUE(owner_id, slot).
 */
module.exports = {
    async up(queryInterface) {
        await ensureUniqueIndexGuarded(queryInterface.sequelize, 'items', ['owner_id', 'slot']);
    },
    async down(queryInterface) {
        const seq = queryInterface.sequelize;
        const [rows] = await seq.query(
            `SELECT index_name FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'items'
               AND index_name = 'items_owner_id_slot_unique' LIMIT 1`
        );
        if (rows.length) await seq.query(`DROP INDEX items_owner_id_slot_unique ON items`);
    },
};
