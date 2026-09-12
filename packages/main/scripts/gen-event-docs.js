const fs = require('fs');
const path = require('path');
const { contracts } = require('../core/eventContracts');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['controllers', 'services', 'core'];
const SEND_EVENT_RE = /sendEvent\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;

function collectFiles(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            collectFiles(full, acc);
        } else if (entry.name.endsWith('.js')) {
            acc.push(full);
        }
    }
    return acc;
}

const used = new Map();
for (const dir of SCAN_DIRS) {
    for (const file of collectFiles(path.join(ROOT, dir))) {
        const src = fs.readFileSync(file, 'utf8');
        SEND_EVENT_RE.lastIndex = 0;
        let m;
        while ((m = SEND_EVENT_RE.exec(src))) {
            const ev = m[1];
            if (!used.has(ev)) used.set(ev, new Set());
            used.get(ev).add(path.relative(ROOT, file).split(path.sep).join('/'));
        }
    }
}

const lines = [
    '# События сервер → клиент',
    '',
    '> Авто-генерация: `npm run docs:events`. Не редактировать вручную.',
    '',
    '| Событие | Аргументы (по позициям) | Отправляется из |',
    '|---|---|---|',
];

for (const [event, sig] of Object.entries(contracts)) {
    const sigs = Array.isArray(sig[0]) ? sig : [sig];
    const types = sigs.map((s) => s.join(', ')).join(' _или_ ');
    const sources = [...(used.get(event) || [])].join(', ') || '—';
    lines.push(`| \`${event}\` | ${types} | ${sources} |`);
}

const outDir = path.join(__dirname, '..', '..', '..', 'docs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir, 'events.md'), lines.join('\n') + '\n');
console.log('[docs] events.md обновлён');
