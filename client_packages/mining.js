require('./ui');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;
const interactions = globalThis.interactions;

/**
 * Шахта: ченнелинг добычи и продажа руды боту.
 */

const HAMMER_DICT = 'amb@world_human_hammering@male@';
const HAMMER_ANIM = 'hammer_a';

let channel = null;
let progressTimer = null;

mp.events.add('client:mining:rocksUpdate', (json) => {
    try {
        state.miningRocksActive = JSON.parse(json);
    } catch (e) {}
});

function playMiningAnim(durationMs) {
    if (natives.playScenario('WORLD_HUMAN_CONST_DRILL')) return;
    if (!natives.requestAnimDict(HAMMER_DICT)) return;
    setTimeout(() => natives.playAnim(HAMMER_DICT, HAMMER_ANIM, durationMs), 500);
}

function cancelChannel() {
    channel = null;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    natives.stopAllTasks();
    ui.call('hideMiningProgress');
    mp.gui.chat.push('!{#FF3333}[Шахта] Добыча прервана.');
}

function finishChannel() {
    const rockIndex = channel.rockIndex;
    channel = null;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    natives.stopAllTasks();
    ui.call('hideMiningProgress');
    mp.events.callRemote('server:mining:complete', rockIndex);
}

mp.events.add('client:mining:startChannel', (rockIndex, durationMs) => {
    if (channel) return;
    const startPos = mp.players.local.position;
    channel = {
        rockIndex,
        startedAt: Date.now(),
        durationMs,
        lastX: startPos.x,
        lastY: startPos.y,
    };
    playMiningAnim(durationMs);

    progressTimer = setInterval(() => {
        if (!channel) return;
        const pct = Math.min(100, ((Date.now() - channel.startedAt) / channel.durationMs) * 100);
        ui.call('updateMiningProgress', Number(pct.toFixed(1)));

        const p = mp.players.local.position;
        const dx = p.x - channel.lastX;
        const dy = p.y - channel.lastY;
        if (Math.sqrt(dx * dx + dy * dy) > 0.15) return cancelChannel();
        channel.lastX = p.x;
        channel.lastY = p.y;

        if (pct >= 100) finishChannel();
    }, 100);
});

mp.events.add('client:mining:sellInfo', (json) => {
    ui.call('setMiningSellInfo', JSON.parse(json));
    ui.toggleWindow('miningSell');
});

mp.events.add('client:mining:sellResult', (success, message) => {
    mp.gui.chat.push(success ? `!{#4CAF50}[Шахта] ${message}` : `!{#FF3333}[Шахта] ${message}`);
    if (success) ui.toggleWindow('miningSell');
});

mp.events.add('client:server:miningSell', () => {
    mp.events.callRemote('server:mining:sell');
});

// --- зоны шахты ---

// камни
interactions.register({
    radius: 3.0,
    getPositions: () => state.positions.miningRocks || [],
    getHint: (i) => (state.miningRocksActive[i] !== false ? 'Добывать' : null),
    onInteract: (i) => {
        if (state.miningRocksActive[i] === false) {
            mp.gui.chat.push('!{#FF3333}[Шахта] Камень исчерпан, жди респавн.');
            return;
        }
        mp.events.callRemote('server:mining:start', i);
    },
});

// скупщик руды
interactions.register({
    radius: 4.0,
    getPositions: () => [state.positions.bot],
    getHint: () => 'Продать руду',
    onInteract: () => mp.events.callRemote('server:mining:requestSellInfo'),
});
