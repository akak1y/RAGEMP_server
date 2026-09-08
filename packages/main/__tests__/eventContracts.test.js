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
            if (!used.has(ev)) used.set(ev, []);
            used.get(ev).push(path.relative(ROOT, file));
        }
    }
}

describe('Инвентаризация событий', () => {
    test('каждое отправляемое событие имеет контракт', () => {
        const missing = [...used.keys()].filter((ev) => !contracts[ev]);
        expect(missing).toEqual([]);
    });

    test('нет мёртвых контрактов (контракт без отправителя)', () => {
        const dead = Object.keys(contracts).filter((ev) => !used.has(ev));
        expect(dead).toEqual([]);
    });
});
