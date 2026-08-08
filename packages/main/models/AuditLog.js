const { Sequelize } = require('sequelize');
const { getSequelize } = require('../db');

let AuditLog = null;
let syncPromise = null;

function initAuditModel() {
    const sequelize = getSequelize();
    AuditLog = sequelize.define('AuditLog', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        category: { type: Sequelize.STRING, defaultValue: 'system' }, // money/admin/auth/vehicle/inventory/security
        action: { type: Sequelize.STRING, allowNull: false },         // pay, givemoney, login_fail, buy_fail
        actor: { type: Sequelize.STRING, allowNull: false },          // ник на момент события
        actor_id: { type: Sequelize.INTEGER, allowNull: true },       // стабильный ID аккаунта
        target: { type: Sequelize.STRING, allowNull: true },          // цель действия
        amount: { type: Sequelize.INTEGER, allowNull: true },         // сумма
        repeats: { type: Sequelize.INTEGER, allowNull: true },        // сколько провалов свёрнуто в строку
        success: { type: Sequelize.BOOLEAN, defaultValue: true },     // удалось ли
        ip: { type: Sequelize.STRING, allowNull: true },              // IP адрес
        hwid: { type: Sequelize.STRING, allowNull: true },            // HWID ПК
        details: { type: Sequelize.TEXT, allowNull: true },           // JSON-контекст (position и т.п.)
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW } // дата события
    }, {
        tableName: 'audit_logs',
        timestamps: false,
        indexes: [
            { fields: ['category'] },
            { fields: ['actor_id'] },
            { fields: ['created_at'] }
        ]
    });
    syncPromise = AuditLog.sync();
}

function getAuditModel() {
    if (!AuditLog) initAuditModel();
    return AuditLog;
}

function ensureAuditReady() {
    if (!AuditLog) initAuditModel();
    return syncPromise;
}

module.exports = { initAuditModel, getAuditModel, ensureAuditReady };