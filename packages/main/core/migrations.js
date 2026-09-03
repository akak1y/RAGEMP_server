const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'schema_version';

/**
 * Система миграций с версионированием.
 * Совместима с форматом Sequelize CLI (up/down получают queryInterface, Sequelize).
 */
class MigrationsRunner {
    constructor(sequelize) {
        this.sequelize = sequelize;
        this.queryInterface = sequelize.getQueryInterface();
    }

    async ensureTable() {
        await this.sequelize.query(`
            CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
                id INT PRIMARY KEY AUTO_INCREMENT,
                version VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async getApplied() {
        const [rows] = await this.sequelize.query(
            `SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY id`
        );
        return rows.map((r) => r.version);
    }

    readFiles() {
        if (!fs.existsSync(MIGRATIONS_DIR)) return [];
        return fs
            .readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.js'))
            .sort();
    }

    async legacyBootstrap(files) {
        if (!files.length) return;
        const [rows] = await this.sequelize.query(
            `SELECT COUNT(1) AS cnt FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = 'accounts'`
        );
        if (Number(rows[0].cnt) === 0) return;

        const first = path.basename(files[0], '.js');
        await this.sequelize.query(`INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES (?)`, {
            replacements: [first],
        });
        logger.info(
            `[Migrations] ${first} помечена применённой без запуска: базовая схема уже существует`
        );
    }

    async run() {
        await this.ensureTable();
        const files = this.readFiles();

        if ((await this.getApplied()).length === 0) await this.legacyBootstrap(files);
        const applied = await this.getApplied();

        let appliedCount = 0;
        for (const file of files) {
            const version = path.basename(file, '.js');
            if (applied.includes(version)) continue;

            const migration = require(path.join(MIGRATIONS_DIR, file));
            if (typeof migration.up !== 'function') {
                logger.warn(`[Migrations] ${file}: нет функции up(), пропускаю`);
                continue;
            }

            try {
                logger.info(`[Migrations] Применяю ${version}...`);
                await migration.up(this.queryInterface, this.sequelize.constructor);
                await this.sequelize.query(`INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES (?)`, {
                    replacements: [version],
                });
                logger.info(`[Migrations] ${version} применена`);
                appliedCount++;
            } catch (err) {
                logger.error(`[Migrations] Ошибка в ${version}: ${err.message}`);
                throw err;
            }
        }

        logger.info(
            appliedCount === 0
                ? '[Migrations] Новых миграций нет'
                : `[Migrations] Применено миграций: ${appliedCount}`
        );
    }
}

module.exports = MigrationsRunner;
