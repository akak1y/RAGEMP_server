const accountService = require('../services/AccountService');
const { getVehicleModel } = require('../models/Vehicle');
const { getItemModel } = require('../models/Item');
const auditService = require('../services/AuditService');
const logger = require('../logger');

const TABLES = {
    accounts: () => accountService.getAllAccounts(['id', 'username', 'money', 'admin_level']),
    vehicles: async () => getVehicleModel().findAll({ raw: true }),
    items: async () => getItemModel().findAll({ raw: true }),
    audit: () => auditService.getRecent(50)
};

async function handleMessage(socket, msg) {
    try {
        if (msg.type === 'get_table') {
            const fn = TABLES[msg.table];
            if (!fn) return;
            socket.send(JSON.stringify({ type: 'table', table: msg.table, rows: await fn() }));
        }
    } catch (err) { logger.error(`[Admin] protocol error: ${err.message}`) }
}

module.exports = { handleMessage }