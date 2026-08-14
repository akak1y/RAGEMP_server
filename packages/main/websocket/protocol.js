const accountService = require('../services/AccountService');
const { getVehicleModel } = require('../models/Vehicle');
const { getItemModel } = require('../models/Item');
const { getUserModel } = require('../models/Users');
const auditService = require('../services/AuditService');
const logger = require('../logger');

const TABLES = {
    accounts: () => accountService.getAllAccounts(['id', 'username', 'money', 'admin_level']),
    vehicles: async () => getVehicleModel().findAll({ raw: true }),
    items: async () => getItemModel().findAll({ raw: true }),
    audit: () => auditService.getRecent(50)
};

const EDITORS = {
    accounts: {
        money: v => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) throw new Error('money >= 0');
            return Math.floor(n);
        },
        admin_level: v => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error('admin_level 0..10');
            return n;
        }
    },
    vehicles: {
        fuel: v => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('fuel 0..100');
            return Math.round(n);
        }
    },
    items: {
        amount: v => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 1 || n > 9999) throw new Error('amount 1..9999');
            return n;
        }
    }
};

const MODELS = {
    accounts: getUserModel,
    vehicles: getVehicleModel,
    items: getItemModel
};

async function handleMessage(socket, msg, broadcast) {
    try {
        if (msg.type === 'get_table') {
            const fn = TABLES[msg.table];
            if (!fn) return;
            socket.send(JSON.stringify({ type: 'table', table: msg.table, rows: await fn() }));
            return;
        }

        if (msg.type === 'update_cell') {
            const editor = (EDITORS[msg.table] || {})[msg.field];
            const getModel = MODELS[msg.table];
            const id = Number(msg.id);
            if (!editor || !getModel || !Number.isInteger(id)) return;

            const value = editor(msg.value);

            const [affected] = await getModel().update({ [msg.field]: value }, { where: { id } });
            if (!affected) return;

            await auditService.log({
                success: 1,
                category: 'web_edit',
                action: `update_${msg.table}`,
                actor: socket.admin.username,
                actor_id: socket.admin.accountId,
                target: id,
                ip: socket.admin.ip,
                details: { field: msg.field, value }
            });

            if (broadcast) broadcast({ type: 'table', table: msg.table, rows: await TABLES[msg.table]() });
        }
    } catch (err) { logger.error(`[Admin] protocol error: ${err.message}`) }
}

module.exports = { handleMessage }