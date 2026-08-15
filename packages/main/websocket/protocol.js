const accountService = require('../services/AccountService');
const { getVehicleModel } = require('../models/Vehicle');
const { getItemModel } = require('../models/Item');
const { getUserModel } = require('../models/Users');
const auditService = require('../services/AuditService');
const healthService = require('../services/HealthService');
const vehicleService = require('../services/VehicleService');
const logger = require('../logger');

const TABLES = {
    accounts: () => accountService.getAllAccounts(['id', 'username', 'money', 'admin_level']),
    vehicles: async () => getVehicleModel().findAll({ raw: true }),
    items: async () => getItemModel().findAll({ raw: true }),
    audit: () => auditService.getRecent(50)
};

const int = (v, min, max, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} ${min}..${max}`);
    return n;
};

const EDITORS = {
    accounts: {
        money: v => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) throw new Error('money >= 0');
            return Math.floor(n);
        },
        admin_level: v => int(v, 0, 10, 'admin_level')
    },
    vehicles: {
        owner_id: v => int(v, 1, 999999, 'owner_id'),
        color_r: v => int(v, 0, 255, 'color_r'),
        color_g: v => int(v, 0, 255, 'color_g'),
        color_b: v => int(v, 0, 255, 'color_b'),
        engine_mod: v => int(v, 0, 3, 'engine_mod'),
        wheel_type: v => int(v, 0, 11, 'wheel_type'),
        wheel_mod: v => int(v, -1, 50, 'wheel_mod'),
        brakes_mod: v => int(v, 0, 2, 'brakes_mod'),
        transmission_mod: v => int(v, 0, 2, 'transmission_mod'),
        turbo_mod: v => int(v, 0, 1, 'turbo_mod'),
        fuel: v => int(v, 0, 100, 'fuel')
    },
    items: {
        count: v => int(v, 1, 9999, 'amount')
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

        if (msg.type === 'vehicle_action') {
            await handleVehicleAction(socket, msg, broadcast);
            return;
        }

        if (msg.type === 'delete_row') {
            await handleDeleteRow(socket, msg, broadcast);
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

            if (msg.table === 'vehicles' && msg.field === 'fuel') vehicleService.setFuel(id, value);

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

async function handleVehicleAction(socket, msg, broadcast) {
    try {
        const { action, targetId } = msg;
        const id = Number(targetId);
        if (!Number.isInteger(id)) return;

        const VehicleModel = getVehicleModel();
        const vehicle = await VehicleModel.findByPk(id);
        if (!vehicle) return;

        let result = { success: true };

        if (action === 'respawn') {
            const done = await vehicleService.respawnVehicle(id);
            result.message = done ? 'Авто переспавнено' : 'Авто не заспавнено — изменения применятся при следующем спавне';
        } else if (action === 'delete') {
            await VehicleModel.destroy({ where: { id } });
            result.message = 'Авто удалено';
        } else return;

        result.message += ` → ${vehicle.model} (id ${id})`;

        await auditService.log({
            success: 1,
            category: 'web_action',
            action: `vehicle_${action}`,
            actor: socket.admin.username,
            actor_id: socket.admin.accountId,
            target: id,
            ip: socket.admin.ip,
            details: { model: vehicle.model, owner_id: vehicle.owner_id }
        });

        if (broadcast) broadcast({ type: 'table', table: 'vehicles', rows: await TABLES.vehicles() });
        socket.send(JSON.stringify({ type: 'action_result', result }));
    } catch (err) { logger.error(`[Admin] vehicle_action error: ${err.message}`) }
}

const DELETABLE = ['items'];

async function handleDeleteRow(socket, msg, broadcast) {
    try {
        const { table, targetId } = msg;
        if (!DELETABLE.includes(table)) return;
        const id = Number(targetId);
        if (!Number.isInteger(id)) return;

        const getModel = MODELS[table];
        const row = await getModel().findByPk(id);
        if (!row) return;

        await getModel().destroy({ where: { id } });

        await auditService.log({
            success: 1,
            category: 'web_action',
            action: `${table}_delete`,
            actor: socket.admin.username,
            actor_id: socket.admin.accountId,
            target: id,
            ip: socket.admin.ip,
            details: { table }
        });

        if (broadcast) broadcast({ type: 'table', table, rows: await TABLES[table]() });
        socket.send(JSON.stringify({ type: 'action_result', result: { success: true, message: `Предмет удалён (id ${id})` } }));
    } catch (err) { logger.error(`[Admin] delete_row error: ${err.message}`) }
}

module.exports = { handleMessage }