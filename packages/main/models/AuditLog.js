const { Sequelize } = require('sequelize');
const { getSequelize } = require('../db');

let AuditLog = null;

function initAuditModel() {
    const sequelize = getSequelize();
    AuditLog = sequelize.define('AuditLog', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        category: { type: Sequelize.STRING, defaultValue: 'system' },
        action: { type: Sequelize.STRING, allowNull: false },
        actor: { type: Sequelize.STRING, allowNull: false },
        actor_id: { type: Sequelize.INTEGER, allowNull: true },
        target: { type: Sequelize.STRING, allowNull: true },
        amount: { type: Sequelize.INTEGER, allowNull: true },
        repeats: { type: Sequelize.INTEGER, allowNull: true },
        success: { type: Sequelize.BOOLEAN, defaultValue: true },
        ip: { type: Sequelize.STRING, allowNull: true },
        hwid: { type: Sequelize.STRING, allowNull: true },
        details: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
    }, {
        tableName: 'audit_logs',
        timestamps: false,
        indexes: [
            { fields: ['category'] },
            { fields: ['actor_id'] },
            { fields: ['created_at'] }
        ]
    });
}

function getAuditModel() {
    if (!AuditLog) initAuditModel();
    return AuditLog;
}

/**
 * Гарантирует, что модель определена
 */
function ensureAuditReady() {
    if (!AuditLog) initAuditModel();
    return Promise.resolve();
}

module.exports = { initAuditModel, getAuditModel, ensureAuditReady }