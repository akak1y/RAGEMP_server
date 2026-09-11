/* global CanvasMapper */
const { createApp } = Vue;

const TABLE_COLUMNS = {
    audit: [
        'id',
        'category',
        'action',
        'actor',
        'actor_id',
        'target',
        'amount',
        'repeats',
        'success',
        'ip',
        'hwid',
        'details',
        'created_at',
    ],
};

createApp({
    data: () => ({
        login: '',
        password: '',
        token: '',
        error: '',
        online: 0,
        players: [],
        active: 'accounts',
        tables: {},
        tabs: ['accounts', 'vehicles', 'items', 'audit', 'events', 'metrics', 'map'],
        GAME_BOUNDS: { minX: -5705.3, minY: -4054.4, maxX: 6739.8, maxY: 8390.7 },
        staticMarkers: [],
        editing: null,
        editValue: '',
        editable: {
            accounts: ['money', 'admin_level'],
            vehicles: [
                'owner_id',
                'color_r',
                'color_g',
                'color_b',
                'engine_mod',
                'wheel_type',
                'wheel_mod',
                'brakes_mod',
                'transmission_mod',
                'turbo_mod',
                'fuel',
            ],
            items: ['count'],
        },
        actionResult: null,
        createSchema: {},
        creating: false,
        createData: {},
        connected: false,
        auditPage: 1,
        auditPages: 1,
        auditTotal: 0,
        metricsCountdown: 15,
        metricsRows: [],
        eventLog: [],
        eventFilter: '',
        eventShowErrorsOnly: false,
    }),
    computed: {
        rows() {
            return this.tables[this.active] || [];
        },
        columns() {
            if (TABLE_COLUMNS[this.active]) return TABLE_COLUMNS[this.active];
            return this.rows.length ? Object.keys(this.rows[0]) : [];
        },
        filteredEvents() {
            let events = this.eventLog;
            if (this.eventShowErrorsOnly) {
                events = events.filter((e) => !e.ok);
            }
            if (this.eventFilter) {
                const filter = this.eventFilter.toLowerCase();
                events = events.filter(
                    (e) =>
                        e.event.toLowerCase().includes(filter) ||
                        e.player.toLowerCase().includes(filter)
                );
            }
            return events;
        },
    },
    methods: {
        fmt(v) {
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(1);
            return v;
        },
        cell(r, c) {
            const v = r[c];
            if (c === 'success') return v === true || v === 1 ? '✔' : '✖';
            return this.fmt(v);
        },
        openTab(t) {
            this.creating = false;
            this.editing = null;
            this.active = t;
            if (t === 'map') {
                this.$nextTick(() => {
                    this.initMap();
                    this.updateMarkers(this.players);
                });
                return;
            }
            if (t === 'audit') {
                this.ws.send(JSON.stringify({ type: 'get_table', table: t, page: this.auditPage }));
                return;
            }
            if (this._metricsTimer) {
                clearInterval(this._metricsTimer);
                this._metricsTimer = null;
            }
            if (t === 'metrics') {
                this.requestMetrics();
                this.metricsCountdown = 15;
                this._metricsTimer = setInterval(() => {
                    this.metricsCountdown--;
                    if (this.metricsCountdown <= 0) {
                        this.requestMetrics();
                        this.metricsCountdown = 15;
                    }
                }, 1000);
                return;
            }
            this.ws.send(JSON.stringify({ type: 'get_table', table: t }));
        },
        initMap() {
            if (this.map) return;
            const container = document.getElementById('map');
            this.map = new CanvasMapper.MapEngine(container, {
                minZoom: 1,
                maxZoom: 6,
                source: new CanvasMapper.UrlTileSource({
                    urlTemplate: 'tiles/{z}/{x}_{y}.jpeg',
                    minNativeZoom: 0,
                    maxNativeZoom: 5, // maxZoom из tiles/manifest.json
                }),
                controls: { position: 'topright' },
            });
            const fit = Math.log2(Math.min(container.clientWidth, container.clientHeight) / 256);
            this.map.setView({ x: 128, y: 128, zoom: fit });
            this.playersLayer = this.map.createLayer('players', { zIndex: 2 });
            this.poisLayer = this.map.createLayer('pois', { zIndex: 1 });
            this.markerObjs = {};
            this.drawStaticMarkers();
            this.updateMarkers(this.players);
        },
        toWorld(x, y) {
            const B = this.GAME_BOUNDS;
            const nx = (x - B.minX) / (B.maxX - B.minX);
            const ny = (y - B.minY) / (B.maxY - B.minY);
            return { x: nx * 256, y: (1 - ny) * 256 };
        },
        emojiIcon(emoji) {
            if (!this._emojiCache) this._emojiCache = {};
            if (this._emojiCache[emoji]) return this._emojiCache[emoji];
            const px = 48;
            const c = document.createElement('canvas');
            c.width = c.height = px;
            const g = c.getContext('2d');
            g.font = `${px - 6}px serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(emoji, px / 2, px / 2 + 2);
            this._emojiCache[emoji] = c.toDataURL();
            return this._emojiCache[emoji];
        },
        updateMarkers(players) {
            if (!this.playersLayer) return;
            const seen = new Set();
            for (const p of players) {
                seen.add(p.id);
                const w = this.toWorld(p.x, p.y);
                const rec = this.markerObjs[p.id];
                if (!rec) {
                    this.markerObjs[p.id] = {
                        marker: this.playersLayer.addMarker({
                            x: w.x,
                            y: w.y,
                            color: '#4f4',
                            size: 12,
                            label: p.name,
                            data: p.id,
                        }),
                    };
                } else {
                    rec.fx = rec.marker.x;
                    rec.fy = rec.marker.y;
                    rec.tx = w.x;
                    rec.ty = w.y;
                    rec.t0 = performance.now();
                }
            }
            for (const key of Object.keys(this.markerObjs)) {
                if (!seen.has(Number(key))) {
                    this.markerObjs[key].marker.remove();
                    delete this.markerObjs[key];
                }
            }
            this.startLerpLoop();
        },
        startLerpLoop() {
            if (this._lerpRunning) return;
            this._lerpRunning = true;
            const step = (now) => {
                let active = 0;
                for (const rec of Object.values(this.markerObjs)) {
                    if (rec.tx === undefined) continue;
                    const t = Math.min(1, (now - rec.t0) / 2800);
                    const e = t * (2 - t);
                    rec.marker.setPosition(
                        rec.fx + (rec.tx - rec.fx) * e,
                        rec.fy + (rec.ty - rec.fy) * e
                    );
                    if (t >= 1) rec.tx = undefined;
                    else active++;
                }
                if (active > 0) requestAnimationFrame(step);
                else this._lerpRunning = false;
            };
            requestAnimationFrame(step);
        },
        drawStaticMarkers() {
            if (!this.poisLayer || this.staticDrawn || !this.staticMarkers.length) return;
            for (const mk of this.staticMarkers) {
                const w = this.toWorld(mk.x, mk.y);
                this.poisLayer.addMarker({
                    x: w.x,
                    y: w.y,
                    icon: this.emojiIcon(mk.icon),
                    label: mk.name,
                    size: 22,
                });
            }
            this.staticDrawn = true;
        },
        async doLogin() {
            const r = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.login, password: this.password }),
            });
            if (r.status === 429) {
                this.error = 'Слишком много попыток — подождите минуту';
                return;
            }
            if (!r.ok) {
                this.error = 'Отказано';
                return;
            }
            this.token = (await r.json()).token;
            this.connect();
        },
        connect() {
            if (this.ws && this.ws.readyState <= 1) this.ws.close();

            this.ws = new WebSocket(`ws://${location.host}?token=${this.token}`);

            this.ws.onopen = () => {
                this._backoff = 500;
                this.connected = true;
                document.title = 'RAGE Admin';
                this.openTab(this.active);
            };

            this.ws.onclose = (ev) => {
                this.connected = false;

                if (ev.code === 4001 || ev.code === 4003) {
                    document.title = '🔒 Доступ отклонён';
                    this.error = 'Сессия недействительна — перезагрузите страницу';
                    return;
                }

                document.title = '⚠ Переподключение…';
                const delay = (this._backoff = Math.min((this._backoff || 500) * 2, 10000));
                setTimeout(() => this.connect(), delay);
            };

            this.ws.onerror = () => this.ws.close();

            this.ws.onmessage = (e) => {
                const m = JSON.parse(e.data);
                if (m.type === 'hello') this.online = m.online;
                if (m.type === 'players') {
                    this.online = m.online;
                    this.players = m.players;
                    this.updateMarkers(m.players);
                }
                if (m.type === 'table') {
                    this.tables[m.table] = m.rows;
                    if (m.table === 'audit') {
                        this.auditPage = m.page || 1;
                        this.auditPages = m.pages || 1;
                        this.auditTotal = m.total || 0;
                    }
                }
                if (m.type === 'audit_row') {
                    if (this.active === 'audit' && this.auditPage === 1) {
                        if (!this.tables.audit) this.tables.audit = [];
                        this.tables.audit.unshift(m.row);
                        if (this.tables.audit.length > 50) this.tables.audit.pop();
                    }
                }
                if (m.type === 'markers') {
                    this.staticMarkers = m.markers;
                    this.$nextTick(() => this.drawStaticMarkers());
                }
                if (m.type === 'action_result') {
                    this.actionResult = m.result;
                    clearTimeout(this._actionTimer);
                    this._actionTimer = setTimeout(() => {
                        this.actionResult = null;
                    }, 5000);
                }
                if (m.type === 'create_schema') {
                    this.createSchema = m.schema;
                }
                if (m.type === 'metrics') this.metricsRows = m.rows;
                if (m.type === 'event_log_init') {
                    this.eventLog = m.events.slice().reverse();
                }
                if (m.type === 'event_log') {
                    this.eventLog.unshift(m.event);
                    if (this.eventLog.length > 200) this.eventLog.pop();
                }
            };
        },
        isEditable(c) {
            return (this.editable[this.active] || []).includes(c);
        },
        startEdit(r, c) {
            if (!this.isEditable(c)) return;
            this.editing = { id: r.id, field: c };
            this.editValue = r[c];
            this.$nextTick(() => {
                const el = this.$refs.editInput;
                const input = Array.isArray(el) ? el[0] : el;
                if (input) input.focus();
            });
        },
        commitEdit() {
            if (!this.editing) return;
            this.ws.send(
                JSON.stringify({
                    type: 'update_cell',
                    table: this.active,
                    id: this.editing.id,
                    field: this.editing.field,
                    value: this.editValue,
                })
            );
            this.editing = null;
        },
        playerAction(action, id) {
            if (!confirm(`Вы уверены? Действие: ${action}`)) return;
            this.ws.send(JSON.stringify({ type: 'player_action', action, targetId: id }));
        },
        vehicleAction(action, id) {
            if (!confirm(`Действие с авто: ${action}?`)) return;
            this.ws.send(JSON.stringify({ type: 'vehicle_action', action, targetId: id }));
        },
        deleteRow(table, id) {
            if (!confirm(`Удалить запись id ${id}?`)) return;
            this.ws.send(JSON.stringify({ type: 'delete_row', table, targetId: id }));
        },
        canCreate() {
            return ['accounts', 'vehicles', 'items'].includes(this.active);
        },
        startCreate() {
            const schema = this.createSchema[this.active];
            if (!schema) return;
            this.createData = {};
            for (const f of schema.fields) this.createData[f] = '';
            this.creating = true;
            this.$nextTick(() => {
                const el = this.$refs.createInput && this.$refs.createInput[0];
                if (el) el.focus();
            });
        },
        cancelCreate() {
            this.creating = false;
            this.createData = {};
        },
        submitCreate() {
            const schema = this.createSchema[this.active];
            if (!schema) return;
            for (const f of schema.required) {
                if (this.createData[f] === '' || this.createData[f] === undefined) {
                    this.actionResult = { success: false, message: `Поле ${f} обязательно` };
                    return;
                }
            }
            this.ws.send(
                JSON.stringify({ type: 'create_row', table: this.active, data: this.createData })
            );
            this.cancelCreate();
        },
        auditGo(page) {
            if (page < 1 || page > this.auditPages) return;
            this.auditPage = page;
            this.openTab('audit');
        },
        requestMetrics() {
            if (this.ws && this.ws.readyState === 1)
                this.ws.send(JSON.stringify({ type: 'get_metrics' }));
        },
        refreshMetricsNow() {
            this.requestMetrics();
            this.metricsCountdown = 15;
        },
        fmtMetric(r) {
            if (r.name === 'rage_memory_rss_bytes') return (r.value / 1048576).toFixed(1) + ' MB';
            if (r.name === 'rage_uptime_seconds') {
                const h = Math.floor(r.value / 3600),
                    m = Math.floor((r.value % 3600) / 60),
                    s = r.value % 60;
                return `${h}ч ${m}м ${s}с`;
            }
            if (r.name === 'rage_economy_money_total')
                return '$' + Number(r.value).toLocaleString('ru-RU');
            return r.value;
        },
        clearEvents() {
            this.eventLog = [];
        },
        fmtArgs(args) {
            return args
                .map((a) => {
                    if (typeof a === 'string') {
                        const t = a.trim();
                        if (t.startsWith('{') || t.startsWith('[')) {
                            try {
                                const parsed = JSON.parse(t);
                                return Array.isArray(parsed)
                                    ? `JSON[${parsed.length}]`
                                    : `JSON{${Object.keys(parsed).length}}`;
                            } catch {
                                return a.slice(0, 40) + '…';
                            }
                        }
                        return a.length > 40 ? a.slice(0, 40) + '…' : a;
                    }
                    return String(a);
                })
                .join(', ');
        },
        fmtArgsLines(args) {
            const lines = [];
            args.forEach((a, i) => {
                if (typeof a === 'string') {
                    const t = a.trim();
                    if (t.startsWith('{') || t.startsWith('[')) {
                        try {
                            const parsed = JSON.parse(t);
                            lines.push(`arg${i}:`);
                            if (Array.isArray(parsed)) {
                                let entries = parsed.map((el, j) => [j, el]);
                                if (parsed.length > 8)
                                    entries = entries.filter(([, el]) => el !== null);
                                const shown = entries.slice(0, 8);
                                shown.forEach(([j, el]) =>
                                    lines.push(`  [${j}] ${this.compact(el)}`)
                                );
                                if (entries.length > 8) lines.push(`  … ещё ${entries.length - 8}`);
                            } else {
                                Object.entries(parsed).forEach(([k, v]) =>
                                    lines.push(`  ${k}: ${this.compact(v)}`)
                                );
                            }
                            return;
                        } catch {}
                    }
                }
                lines.push(`arg${i}: ${this.compact(a)}`);
            });
            return lines;
        },
        compact(v) {
            if (v === null) return 'null';
            if (typeof v === 'object') {
                const s = JSON.stringify(v);
                return s.length > 60 ? s.slice(0, 60) + '…' : s;
            }
            return String(v);
        },
    },
}).mount('#app');
