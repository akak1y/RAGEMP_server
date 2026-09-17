'use strict';

/**
 * Хелперы миграций: идемпотентные операции с индексами.
 */

/**
 * Есть ли на таблице индекс ровно с таким составом колонок.
 * @param {Sequelize} sequelize
 * @param {string} table
 * @param {string[]} columns
 * @returns {Promise<{name: string, cols: string}|null>}
 */
async function findIndexByColumns(sequelize, table, columns) {
    const [rows] = await sequelize.query(
        `SELECT index_name AS name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ?
         GROUP BY index_name`,
        { replacements: [table] }
    );
    const wanted = columns.join(',');
    return rows.find((r) => r.cols === wanted) || null;
}

/**
 * Создать индекс, только если покрытия колонок ещё нет.
 * @param {Sequelize} sequelize
 * @param {string} table
 * @param {string[]} columns
 * @param {{unique?: boolean, name?: string}} [options] - unique флаг и явное имя
 */
async function ensureIndex(sequelize, table, columns, options = {}) {
    const { unique = false, name } = options;
    if (await findIndexByColumns(sequelize, table, columns)) return;
    const indexName = name || `${table}_${columns.join('_')}${unique ? '_unique' : ''}`;
    await sequelize.query(
        `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${indexName} ON ${table} (${columns.join(', ')})`
    );
}

/**
 * Удалить индекс по имени, если он существует.
 * @param {Sequelize} sequelize
 * @param {string} table
 * @param {string} indexName
 */
async function dropIndexIfExists(sequelize, table, indexName) {
    const [rows] = await sequelize.query(
        `SELECT COUNT(1) AS cnt FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        { replacements: [table, indexName] }
    );
    if (Number(rows[0].cnt) === 0) return;
    await sequelize.query(`DROP INDEX ${indexName} ON ${table}`);
}

module.exports = { ensureIndex, dropIndexIfExists };
