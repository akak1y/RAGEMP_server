const accountService = require('../services/AccountService');
const { getVehicleModel } = require('../models/Vehicle');
const { getItemModel } = require('../models/Item');
const { getUserModel } = require('../models/Users');
const auditService = require('../services/AuditService');
const healthService = require('../services/HealthService');
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

        if (msg.type === 'player_action') {
            await handlePlayerAction(socket, msg, broadcast);
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

async function handlePlayerAction(socket, msg, broadcast) {
    try {
        const { action, targetId } = msg;
        const id = Number(targetId);
        if (!Number.isInteger(id)) return;

        const player = mp.players.toArray().find(p => p.accountId === id);
        
        const UserModel = getUserModel();
        const account = await UserModel.findByPk(id);
        if (!account) return;

        let result = { success: true };
        let auditDetails = { action, targetId };

        if (action === 'heal') {
            if (player) { await healthService.setHealth(player, 100) }
            else { await UserModel.update({ hp: 100 }, { where: { id } }) }
            result.message = 'Игрок вылечен';
        } else if (action === 'kill') {
            if (player) { await healthService.setHealth(player, 0) }
            else { await UserModel.update({ hp: 0 }, { where: { id } }) }
            result.message = 'Игрок убит';
        } else if (action === 'delete') {
            if (id === socket.admin.accountId) { result = { success: false, message: 'Нельзя удалить себя' } }
            else if (account.admin_level > socket.admin.adminLevel) { result = { success: false, message: 'Нет прав удалять админа выше уровнем' } }
            else {
                await UserModel.destroy({ where: { id } });
                if (player) player.kick('Аккаунт удалён администратором');
                result.message = 'Аккаунт удалён';
            }
        } else { return }

        await auditService.log({
            success: result.success ? 1 : 0,
            category: 'web_action',
            action: `player_${action}`,
            actor: socket.admin.username,
            actor_id: socket.admin.accountId,
            target: id,
            ip: socket.admin.ip,
            details: { ...auditDetails, result: result.message }
        });
        if (broadcast) broadcast({ type: 'table', table: 'accounts', rows: await TABLES.accounts() });
        
        if (result.success) result.message += ` → ${account.username} [${account.id}]`;
        socket.send(JSON.stringify({ type: 'action_result', result }));
    } catch (err) { logger.error(`[Admin] player_action error: ${err.message}`) }
}

module.exports = { handleMessage }