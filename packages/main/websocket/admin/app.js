const { createApp } = Vue;

const TABLE_COLUMNS = {
    audit: ['id', 'category', 'action', 'actor', 'actor_id', 'target', 'amount', 'repeats', 'success', 'ip', 'hwid', 'details', 'created_at']
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
        tabs: ['accounts', 'vehicles', 'items', 'audit', 'map'],
        GAME_BOUNDS: { minX: -5693, minY: -4045, maxX: 6729, maxY: 8392 },
        staticMarkers: [],
        editing: null,
        editValue: '',
        editable: {
            accounts: ['money', 'admin_level'],
            vehicles: ['owner_id', 'color_r', 'color_g', 'color_b', 'engine_mod', 'wheel_type', 'wheel_mod', 'brakes_mod', 'transmission_mod', 'turbo_mod', 'fuel'],
            items: ['count']
        },
        actionResult: null,
    }),
    computed: {
        rows() { return this.tables[this.active] || []; },
        columns() {
            if (TABLE_COLUMNS[this.active]) return TABLE_COLUMNS[this.active];
            return this.rows.length ? Object.keys(this.rows[0]) : [];
        }
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
            if (c === 'success') return (v === true || v === 1) ? '✔' : '✖';
            return this.fmt(v);
        },
        openTab(t) {
            this.editing = null;
            this.active = t;
            if (t === 'map') {
                this.$nextTick(() => {
                    this.initMap();
                    if (this.map) this.map.invalidateSize();
                    this.updateMarkers(this.players);
                });
                return
            }
            this.ws.send(JSON.stringify({ type: 'get_table', table: t }));
        },
        zoomIn() {
            if (this.map) this.map.zoomIn();
        },
        zoomOut() {
            if (this.map) this.map.zoomOut();
        },
        initMap() {
            if (this.map) return;
            this.map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 5, attributionControl: false, zoomControl: false });
            const bounds = [[0, 0], [1000, 1000]];
            this.map.fitBounds(bounds);
            const img = new Image();
            img.onload = () => L.imageOverlay('map.jpg', bounds).addTo(this.map);
            img.src = 'map.jpg';
            this.markerObjs = {};
            this.drawStaticMarkers();
        },
        toMap(x, y) {
            const B = this.GAME_BOUNDS;
            const nx = (x - B.minX) / (B.maxX - B.minX);
            const ny = (y - B.minY) / (B.maxY - B.minY);
            return [ny * 1000, nx * 1000];
        },
        updateMarkers(players) {
            if (!this.map || this.active !== 'map') return;
            const seen = new Set();
            for (const p of players) {
                seen.add(p.id);
                const pos = this.toMap(p.x, p.y);
                if (!this.markerObjs[p.id]) {
                    const icon = L.divIcon({ className: '', iconSize: [10, 10], html: `<div class="pm"><span>${p.name}</span></div>` });
                    this.markerObjs[p.id] = L.marker(pos, { icon }).addTo(this.map);
                } else { this.markerObjs[p.id].setLatLng(pos) }
            }
            for (const key of Object.keys(this.markerObjs)) {
                if (!seen.has(Number(key))) {
                    this.markerObjs[key].remove();
                    delete this.markerObjs[key]
                }
            }
        },
        async doLogin() {
            const r = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.login, password: this.password }) });
            if (!r.ok) { this.error = 'Отказано'; return; }
            this.token = (await r.json()).token;
            this.connect();
        },
        connect() {
            this.ws = new WebSocket(`ws://${location.host}?token=${this.token}`);
            this.ws.onopen = () => this.openTab(this.active);
            this.ws.onmessage = (e) => {
                const m = JSON.parse(e.data);
                if (m.type === 'hello') this.online = m.online;
                if (m.type === 'players') { this.online = m.online; this.players = m.players; this.updateMarkers(m.players); }
                if (m.type === 'table') this.tables[m.table] = m.rows;
                if (m.type === 'audit_row') {
                    if (!this.tables.audit) this.tables.audit = [];
                    this.tables.audit.unshift(m.row);
                    if (this.tables.audit.length > 50) this.tables.audit.pop();
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
                    }, 5000)
                }
            };
        },
        drawStaticMarkers() {
            if (!this.map || this.staticDrawn || !this.staticMarkers.length) return;
            for (const mk of this.staticMarkers) {
                const icon = L.divIcon({
                    className: '', iconSize: [22, 22],
                    html: `<div class="sm">${mk.icon}</div>`
                });
                L.marker(this.toMap(mk.x, mk.y), { icon })
                    .addTo(this.map)
                    .bindTooltip(mk.name, { direction: 'top', offset: [0, -10] });
            }
            this.staticDrawn = true
        },
        isEditable(c) {
            return (this.editable[this.active] || []).includes(c)
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
            this.ws.send(JSON.stringify({
                type: 'update_cell', table: this.active,
                id: this.editing.id, field: this.editing.field, value: this.editValue
            }));
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
    }
}).mount('#app');