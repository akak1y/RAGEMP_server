const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const authService = require('../services/AuthService');
const auditService = require('../services/AuditService');
const logger = require('../core/logger');
const metrics = require('../core/metrics');
const eventLog = require('../core/eventLog');
const { getUserModel } = require('../models/Users');
const {
    handleMessage,
    getCreateSchema,
    refreshLiveMetrics,
    setWsClientsGetter,
} = require('./protocol');
const config = require('../config');

let settings = {};
try {
    settings = require('../settings.json');
} catch {
    settings = {};
}
const ADMIN_PORT = (settings.admin && settings.admin.port) || 8081;
const JWT_SECRET = (settings.admin && settings.admin.jwtSecret) || 'dev-secret-key';

if (!settings.admin || !settings.admin.jwtSecret) {
    logger.warn('[Admin] JWT-секрет не задан в settings.json — используется dev-значение.');
}

const MIME = {
    '.html': 'text/html;charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

const MAP_MARKER_DEFS = [
    { path: 'DealershipPos', name: 'Автосалон', icon: '🚗' },
    { path: 'HospitalPos', name: 'Больница', icon: '🏥' },
    { path: 'CarCustomPos', name: 'LSC', icon: '🔧' },
    { path: 'FuelStationPos', name: 'Заправка', icon: '⛽' },
    { path: 'CourierConfig.startPos', name: 'Курьер', icon: '📦' },
    { path: 'GaragePos', name: 'Гараж', icon: '🅿️' },
    { path: 'ShopConfig.position', name: 'Магазин', icon: '🛒' },
    { path: 'MafiaBasePos', name: 'Семья', icon: '🏰' },
    { path: 'BotConfig.position', name: 'Скупщик руды', icon: '⛏️' },
];

const MAP_MARKERS = MAP_MARKER_DEFS.map((def) => {
    if (def._coords) return { name: def.name, icon: def.icon, x: def._coords.x, y: def._coords.y };
    const obj = def.path.split('.').reduce((o, k) => o && o[k], config);
    if (!obj || typeof obj.x !== 'number' || typeof obj.y !== 'number') return null;
    return { name: def.name, icon: def.icon, x: obj.x, y: obj.y };
}).filter(Boolean);

const clients = new Set();

setWsClientsGetter(() => clients.size);

function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const s of clients) {
        if (s.readyState === 1) s.send(data);
    }
}

let httpServer = null;
let wss = null;
let playersTimer = null;
let unsubAudit = null;
let unsubEvents = null;

const loginFails = new Map();
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 60000;

/**
 * Валидация JWT + сверка admin_level с БД.
 */
async function verifyAdminToken(token) {
    if (!token) return null;
    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
    if (!payload || payload.adminLevel < 1) return null;
    try {
        const account = await getUserModel().findByPk(payload.accountId, { raw: true });
        if (!account || (account.admin_level || 0) < 1) return null;
        return { ...payload, adminLevel: account.admin_level };
    } catch (err) {
        logger.error(`[Admin] verifyAdminToken: ${err.message}`);
        return null;
    }
}

function start() {
    if (httpServer) return;
    httpServer = http.createServer((req, res) => {
        metrics.inc('rage_http_requests_total', 'Admin panel HTTP requests');
        if (req.method === 'POST' && req.url === '/login') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', async () => {
                const ip = req.socket.remoteAddress || 'unknown';
                const now = Date.now();
                const rec = loginFails.get(ip);
                if (rec && now < rec.resetAt && rec.count >= LOGIN_MAX_FAILS) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'too_many_attempts' }));
                }
                try {
                    const { username, password } = JSON.parse(body || '{}');
                    const r = await authService.authenticate(username, password);
                    if (!r.success || (r.user.admin_level || 0) < 1) {
                        const cur = loginFails.get(ip);
                        if (!cur || now >= cur.resetAt)
                            loginFails.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
                        else cur.count += 1;
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'forbidden' }));
                    }
                    loginFails.delete(ip);
                    const token = jwt.sign(
                        {
                            accountId: r.user.id,
                            username: r.user.username,
                            adminLevel: r.user.admin_level,
                        },
                        JWT_SECRET,
                        { expiresIn: '8h' }
                    );
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ token }));
                } catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'bad_request' }));
                }
            });
            return;
        }

        if (req.method === 'GET' && req.url === '/metrics') {
            (async () => {
                try {
                    await refreshLiveMetrics();
                    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
                    res.end(metrics.render());
                } catch (err) {
                    logger.error(`[Admin] metrics error: ${err.message}`);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                    }
                    res.end(JSON.stringify({ error: 'metrics_unavailable' }));
                }
            })();
            return;
        }

        if (req.method === 'GET') {
            const rawPath = req.url.split('?')[0];
            const urlPath = rawPath === '/' ? '/index.html' : rawPath;
            const adminDir = path.resolve(__dirname, 'admin');
            const filePath = path.resolve(adminDir, '.' + urlPath);

            if (filePath !== adminDir && !filePath.startsWith(adminDir + path.sep)) {
                res.writeHead(403);
                return res.end('forbidden');
            }

            fs.readFile(filePath, (err, buf) => {
                if (err) {
                    res.writeHead(404);
                    return res.end('not found');
                }
                const ext = path.extname(filePath);
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                res.end(buf);
            });
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });

    httpServer.on('error', (err) => {
        logger.error(`[Admin] HTTP server error: ${err.message}`);
    });

    wss = new WebSocketServer({ server: httpServer });
    wss.on('error', (err) => {
        logger.error(`[Admin] WebSocket server error: ${err.message}`);
    });

    wss.on('connection', async (socket, req) => {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        const admin = await verifyAdminToken(token);
        if (!admin) {
            let code = 4001;
            try {
                const p = jwt.verify(token, JWT_SECRET);
                if (p && p.adminLevel >= 1) code = 4003;
            } catch {}
            socket.close(code, code === 4003 ? 'revoked or demoted' : 'bad token');
            return;
        }

        socket.admin = { ...admin, ip: req.socket.remoteAddress };
        clients.add(socket);

        socket.on('error', (err) => {
            logger.error(`[Admin] socket error: ${err.message}`);
        });
        socket.on('close', () => clients.delete(socket));
        socket.send(
            JSON.stringify({ type: 'hello', admin: admin.username, online: mp.players.length })
        );
        socket.send(JSON.stringify({ type: 'markers', markers: MAP_MARKERS }));
        socket.send(JSON.stringify({ type: 'create_schema', schema: getCreateSchema() }));
        socket.send(JSON.stringify({ type: 'event_log_init', events: eventLog.getRecent(100) }));

        socket.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data);
            } catch {
                return;
            }
            handleMessage(socket, msg, broadcast);
        });
    });

    unsubAudit = auditService.subscribe((row) => {
        broadcast({ type: 'audit_row', row: row.toJSON ? row.toJSON() : row });
    });

    unsubEvents = eventLog.subscribe((event) => {
        broadcast({ type: 'event_log', event });
    });

    playersTimer = setInterval(() => {
        const players = mp.players
            .toArray()
            .filter((p) => p.isLoggedIn)
            .map((p) => ({
                id: p.accountId,
                name: p.accountName,
                x: p.position.x,
                y: p.position.y,
                z: p.position.z,
                heading: p.heading,
            }));
        broadcast({ type: 'players', online: players.length, players });
    }, 5000);

    if (playersTimer.unref) playersTimer.unref();

    httpServer.listen(ADMIN_PORT, () => {
        logger.info(`[Admin] Веб-админка на http://localhost:${ADMIN_PORT}`);
    });
}

function stop() {
    return new Promise((resolve) => {
        if (!httpServer && !wss) return resolve();
        if (playersTimer) {
            clearInterval(playersTimer);
            playersTimer = null;
        }
        if (unsubAudit) {
            try {
                unsubAudit();
            } catch {}
            unsubAudit = null;
        }
        if (unsubEvents) {
            try {
                unsubEvents();
            } catch {}
            unsubEvents = null;
        }
        for (const s of clients) {
            try {
                s.terminate();
            } catch {}
        }
        clients.clear();
        const closeHttp = () => {
            if (!httpServer) return resolve();
            const server = httpServer;
            httpServer = null;
            try {
                if (typeof server.closeAllConnections === 'function') {
                    server.closeAllConnections();
                }
            } catch {}
            server.close(() => {
                logger.info('[Admin] HTTP сервер остановлен');
                resolve();
            });
        };
        if (wss) {
            const serverWs = wss;
            wss = null;
            serverWs.close(() => {
                logger.info('[AdminWS] WebSocket сервер остановлен');
                closeHttp();
            });
        } else {
            closeHttp();
        }
    });
}

module.exports = { start, broadcast, stop };
