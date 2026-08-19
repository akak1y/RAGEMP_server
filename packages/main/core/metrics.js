/**
 * Prometheus exporter без внешних зависимостей.
 */
class Metrics {
    constructor() {
        this.counters = new Map();
        this.gauges = new Map();
    }

    inc(name, help = '', by = 1) {
        if (!this.counters.has(name)) this.counters.set(name, { help, value: 0 });
        this.counters.get(name).value += by;
    }

    set(name, value, help = '') {
        if (!this.gauges.has(name)) this.gauges.set(name, { help, value: 0 });
        this.gauges.get(name).value = value;
    }

    render() {
        const lines = [];
        for (const [name, m] of this.counters) {
            lines.push(`# HELP ${name} ${m.help}`);
            lines.push(`# TYPE ${name} counter`);
            lines.push(`${name} ${m.value}`);
        }
        for (const [name, m] of this.gauges) {
            lines.push(`# HELP ${name} ${m.help}`);
            lines.push(`# TYPE ${name} gauge`);
            lines.push(`${name} ${m.value}`);
        }
        return lines.join('\n') + '\n';
    }

    // JSON-снапшот всех метрик для веб-админки
    snapshot() {
        const rows = [];
        for (const [name, m] of this.counters) rows.push({ name, help: m.help, type: 'counter', value: m.value });
        for (const [name, m] of this.gauges) rows.push({ name, help: m.help, type: 'gauge', value: m.value });
        return rows;
    }
}

const metrics = new Metrics();

// предрегистрация всех метрик
metrics.inc('rage_events_processed_total', 'Game events processed by handlers', 0);
metrics.inc('rage_handler_errors_total', 'Errors caught by error boundary', 0);
metrics.inc('rage_ratelimit_blocks_total', 'Rate-limit blocks', 0);
metrics.inc('rage_cache_hits_total', 'Redis cache hits', 0);
metrics.inc('rage_cache_misses_total', 'Redis cache misses', 0);
metrics.inc('rage_http_requests_total', 'Admin panel HTTP requests', 0);
metrics.set('rage_players_online', 0, 'Players currently online');
metrics.set('rage_vehicles_spawned', 0, 'Vehicles currently spawned');
metrics.set('rage_uptime_seconds', 0, 'Server uptime in seconds');
metrics.set('rage_memory_rss_bytes', 0, 'Process memory (RSS)');
metrics.set('rage_ws_clients', 0, 'Connected admin WebSocket clients');
metrics.set('rage_accounts_total', 0, 'Total registered accounts');
metrics.set('rage_economy_money_total', 0, 'Total money in economy');

module.exports = metrics;