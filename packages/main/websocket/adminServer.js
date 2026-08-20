const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const authService = require('../services/AuthService');
const auditService = require('../services/AuditService');
const logger = require('../core/logger');
const metrics = require('../core/metrics');
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

const MIME = {
    '.html': 'text/html;charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.jpg': 'image/jpeg',
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

let wss = null;

function start() {
    const server = http.createServer((req, res) => {
        metrics.inc('rage_http_requests_total', 'Admin panel HTTP requests');
        if (req.method === 'POST' && req.url === '/login') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', async () => {
                try {
                    const { username, password } = JSON.parse(body || '{}');
                    const r = await authService.authenticate(username, password);
                    if (!r.success || (r.user.admin_level || 0) < 1) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'forbidden' }));
                    }
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
                await refreshLiveMetrics();
                res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
                res.end(metrics.render());
            })();
            return;
        }

        if (req.method === 'GET') {
            const urlPath = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
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

    const wss = new WebSocketServer({ server });

    wss.on('connection', (socket, req) => {
        const url = new URL(req.url, 'http://localhost');
        let payload;
        try {
            payload = jwt.verify(url.searchParams.get('token'), JWT_SECRET);
        } catch {
            return socket.close(4001, 'bad token');
        }
        if (!payload || payload.adminLevel < 1) return socket.close(4003, 'not admin');

        socket.admin = { ...payload, ip: req.socket.remoteAddress };
        clients.add(socket);
        socket.on('close', () => clients.delete(socket));
        socket.send(
            JSON.stringify({ type: 'hello', admin: payload.username, online: mp.players.length })
        );
        socket.send(JSON.stringify({ type: 'markers', markers: MAP_MARKERS }));
        socket.send(JSON.stringify({ type: 'create_schema', schema: getCreateSchema() }));

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

    auditService.subscribe((row) => {
        broadcast({ type: 'audit_row', row: row.toJSON ? row.toJSON() : row });
    });

    setInterval(() => {
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

    server.listen(ADMIN_PORT, () => {
        logger.info(`[Admin] Веб-админка на http://localhost:${ADMIN_PORT}`);
    });
}

function stop() {
    return new Promise((resolve) => {
        if (!wss) return resolve();
        wss.close(() => {
            logger.info('[AdminWS] WebSocket сервер остановлен');
            resolve();
        });
    });
}

module.exports = { start, broadcast, stop };
