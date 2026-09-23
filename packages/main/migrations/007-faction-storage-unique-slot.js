'use strict';
const { ensureUniqueIndexGuarded } = require('../core/migrationHelpers');

/**
 * Защита слотов склада на уровне БД: UNIQUE(faction_id, slot).
 */
module.exports = {
    async up(queryInterface) {
        await ensureUniqueIndexGuarded(queryInterface.sequelize, 'faction_storage_items', [
            'faction_id',
            'slot',
        ]);
    },
    async down(queryInterface) {
        const seq = queryInterface.sequelize;
        const [rows] = await seq.query(
            `SELECT index_name FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'faction_storage_items'
               AND index_name = 'faction_storage_items_faction_id_slot_unique' LIMIT 1`
        );
        if (rows.length)
            await seq.query(
                `DROP INDEX faction_storage_items_faction_id_slot_unique ON faction_storage_items`
            );
    },
};
