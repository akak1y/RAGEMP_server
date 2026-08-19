const { getVehicleModel } = require('../models/Vehicle');
const { getItemModel } = require('../models/Item');
const { getUserModel } = require('../models/Users');
const accountService = require('../services/AccountService');
const auditService = require('../services/AuditService');
const healthService = require('../services/HealthService');
const vehicleService = require('../services/VehicleService');
const authService = require('../services/AuthService');
const statsService = require('../services/StatsService');
const { ItemConfig, VehicleConfig } = require('../config');
const logger = require('../core/logger');
const metrics = require('../core/metrics');

const TABLES = {
    accounts: () => getUserModel().findAll({ order: [['id', 'DESC']], raw: true, attributes: ['id', 'username', 'money', 'admin_level'] }),
    vehicles: async () => getVehicleModel().findAll({ order: [['id', 'DESC']], raw: true }),
    items: async () => getItemModel().findAll({ order: [['id', 'DESC']], raw: true })
};

const int = (v, min, max, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} ${min}..${max}`);
    return n;
};

const EDITORS = {
    accounts: {
        money: v => int(v, 0, 2147483647, 'admin_level'),
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

const CREATORS = {
    accounts: {
        fields: ['username', 'password', 'money', 'admin_level'],
        required: ['username', 'password'],
        validators: {
            username: v => {
                if (!v || v.length < 2 || v.length > 32) throw new Error('username 2..32');
                return String(v)
            },
            password: v => {
                if (!v || v.length < 3) throw new Error('password >= 3');
                return String(v)
            },
            money: v => int(v, 0, 2147483647, 'money'),
            admin_level: v => int(v, 0, 10, 'admin_level'),
        },
        create: async (data) => {
            const result = await authService.register(data.username, data.password, {
                money: data.money ?? 50000,
                admin_level: data.admin_level ?? 0
            });
            if (!result.success) throw new Error(`register: ${result.error}`);
            return result.user;
        }
    },
    vehicles: {
        fields: ['owner_id', 'model', 'fuel', 'color_r', 'color_g', 'color_b', 'engine_mod', 'brakes_mod', 'transmission_mod', 'turbo_mod', 'wheel_type', 'wheel_mod'],
        required: ['owner_id', 'model'],
        validators: {
            owner_id: v => int(v, 1, 999999, 'owner_id'),
            model: v => {
                if (!VehicleConfig[v]) throw new Error('unknown model');
                return v
            },
            fuel: v => int(v, 0, 100, 'fuel'),
            color_r: v => int(v, 0, 255, 'color_r'),
            color_g: v => int(v, 0, 255, 'color_g'),
            color_b: v => int(v, 0, 255, 'color_b'),
            engine_mod: v => int(v, 0, 3, 'engine_mod'),
            brakes_mod: v => int(v, 0, 2, 'brakes_mod'),
            transmission_mod: v => int(v, 0, 2, 'transmission_mod'),
            turbo_mod: v => int(v, 0, 1, 'turbo_mod'),
            wheel_type: v => int(v, 0, 11, 'wheel_type'),
            wheel_mod: v => int(v, -1, 50, 'wheel_mod'),
        },
        create: async (data) => {
            const owner = await getUserModel().findByPk(data.owner_id);
            if (!owner) throw new Error('owner not found');
            return await getVehicleModel().create(data)
        }
    },
    items: {
        fields: ['owner_id', 'item_id', 'count', 'slot'],
        required: ['owner_id', 'item_id', 'slot'],
        validators: {
            owner_id: v => int(v, 1, 999999, 'owner_id'),
            item_id: v => {
                if (!ItemConfig[v]) throw new Error('unknown item');
                return v
            },
            count: v => int(v, 1, 9999, 'count'),
            slot: v => int(v, 0, 99, 'slot'),
        },
        create: async (data) => {
            const owner = await getUserModel().findByPk(data.owner_id);
            if (!owner) throw new Error('owner not found');
            const existing = await getItemModel().findOne({ where: { owner_id: data.owner_id, slot: data.slot } });
            if (existing) throw new Error(`slot ${data.slot} занят`);
            return await getItemModel().create(data)
        }
    }
};

const MODELS = {
    accounts: getUserModel,
    vehicles: getVehicleModel,
    items: getItemModel
};

const DELETABLE = ['accounts', 'vehicles', 'items'];

const DELETE_NAMES = {
    accounts: 'Аккаунт удалён',
    vehicles: 'Авто удалено',
    items: 'Предмет удалён'
};

const DELETE_HOOKS = {
    accounts: async (socket, id, row) => {
        if (id === socket.admin.accountId) throw new Error('Нельзя удалить себя');
        if ((row.admin_level || 0) > (socket.admin.adminLevel || 0)) throw new Error('Нельзя удалить админа выше уровнем');
        const player = mp.players.toArray().find(p => p.accountId === id);
        if (player) player.kick('Аккаунт удалён администратором');
    },
    vehicles: async (socket, id) => { await vehicleService.despawnVehicle(id, false) }
};

let getWsClients = () => 0;

function setWsClientsGetter(fn) {
    getWsClients = fn
}

async function refreshLiveMetrics() {
    metrics.set('rage_players_online', mp.players.length, 'Players currently online');
    metrics.set('rage_vehicles_spawned', mp.vehicles.length, 'Vehicles currently spawned');
    metrics.set('rage_uptime_seconds', Math.round(process.uptime()), 'Server uptime in seconds');
    metrics.set('rage_memory_rss_bytes', process.memoryUsage().rss, 'Process memory (RSS)');
    metrics.set('rage_ws_clients', getWsClients(), 'Connected admin WebSocket clients');
    const eco = await statsService.getCachedEconomy();
    if (eco) {
        metrics.set('rage_accounts_total', eco.total, 'Total registered accounts');
        metrics.set('rage_economy_money_total', eco.totalMoney, 'Total money in economy');
    }
}

async function handleMessage(socket, msg, broadcast) {
    try {
        if (msg.type === 'get_table') {
            if (msg.table === 'audit') {
                const per = 50;
                const page = Math.max(1, Number(msg.page) || 1);
                const { rows, total } = await auditService.getAuditPage(page, per, msg.category || null);
                socket.send(JSON.stringify({
                    type: 'table', table: 'audit', rows,
                    page, total, pages: Math.max(1, Math.ceil(total / per))
                }));
                return;
            }
            const fn = TABLES[msg.table];
            if (!fn) return;
            socket.send(JSON.stringify({ type: 'table', table: msg.table, rows: await fn() }));
            return;
        }

        if (msg.type === 'get_metrics') {
            await refreshLiveMetrics();
            socket.send(JSON.stringify({ type: 'metrics', rows: metrics.snapshot() }));
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

        if (msg.type === 'create_row') {
            await handleCreateRow(socket, msg, broadcast);
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
        } else { return }

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

async function handleDeleteRow(socket, msg, broadcast) {
    try {
        const { table, targetId } = msg;
        if (!DELETABLE.includes(table)) return;
        const id = Number(targetId);
        if (!Number.isInteger(id)) return;

        const getModel = MODELS[table];
        const row = await getModel().findByPk(id);
        if (!row) return;

        const hook = DELETE_HOOKS[table];
        if (hook) await hook(socket, id, row);

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
        socket.send(JSON.stringify({
            type: 'action_result',
            result: { success: true, message: `${DELETE_NAMES[table]} (id ${id})` }
        }));
    } catch (err) {
        socket.send(JSON.stringify({
            type: 'action_result',
            result: { success: false, message: err.message }
        }));
        logger.error(`[Admin] delete_row error: ${err.message}`);
    }
}

async function handleCreateRow(socket, msg, broadcast) {
    try {
        const { table, data } = msg;
        const cfg = CREATORS[table];
        if (!cfg) return;

        const cleaned = {};
        for (const field of cfg.fields) {
            const raw = data[field];
            if ((raw === '' || raw === undefined || raw === null) && cfg.required.includes(field)) throw new Error(`${field} обязательно`);
            if (raw === '' || raw === undefined || raw === null) continue;
            const validator = cfg.validators[field];
            if (!validator) throw new Error(`unknown field ${field}`);
            cleaned[field] = validator(raw);
        }

        const created = await cfg.create(cleaned);

        await auditService.log({
            success: 1,
            category: 'web_create',
            action: `create_${table}`,
            actor: socket.admin.username,
            actor_id: socket.admin.accountId,
            target: created.id || null,
            ip: socket.admin.ip,
            details: cleaned
        });

        if (broadcast) broadcast({ type: 'table', table, rows: await TABLES[table]() });
        socket.send(JSON.stringify({
            type: 'action_result',
            result: { success: true, message: `Создано: ${table} (id ${created.id})` }
        }));
    } catch (err) {
        socket.send(JSON.stringify({
            type: 'action_result',
            result: { success: false, message: err.message }
        }));
        logger.error(`[Admin] create_row error: ${err.message}`);
    }
}

function getCreateSchema() {
    return Object.fromEntries(
        Object.entries(CREATORS).map(([t, c]) => [t, {
            fields: c.fields,
            required: c.required,
            options: {
                vehicles: { model: Object.keys(VehicleConfig) },
                items:    { item_id: Object.keys(ItemConfig) }
            }[t] || {}
        }])
    );
}

module.exports = { handleMessage, getCreateSchema, refreshLiveMetrics, setWsClientsGetter }