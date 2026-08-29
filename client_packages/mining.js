const state = globalThis.UIState;
require('./anim');
require('./ui');

const ui = globalThis.ui;
const anim = globalThis.anim;

const HAMMER_DICT = 'amb@world_human_hammering@male@';
const HAMMER_ANIM = 'hammer_a';

let channel = null;
let progressTimer = null;

mp.events.add('client:mining:setData', (json) => {
    try {
        const data = JSON.parse(json);
        state.positions.miningRocks = (data.rocks || []).map((r) => new mp.Vector3(r.x, r.y, r.z));
        state.positions.bot = new mp.Vector3(data.botPos.x, data.botPos.y, data.botPos.z);
        state.miningRocksActive = data.active || (data.rocks || []).map(() => true);
    } catch (e) {
        mp.gui.chat.push('!{#FF3333}[Шахта] Ошибка данных локаций');
    }
});

mp.events.add('client:mining:rocksUpdate', (json) => {
    try {
        state.miningRocksActive = JSON.parse(json);
    } catch (e) {}
});

function playMiningAnim(durationMs) {
    if (anim.playScenario('WORLD_HUMAN_CONST_DRILL')) return;
    if (!anim.requestAnimDict(HAMMER_DICT)) return;
    setTimeout(() => anim.playAnim(HAMMER_DICT, HAMMER_ANIM, durationMs), 500);
}

function cancelChannel() {
    channel = null;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    anim.stopAllTasks();
    ui.call('hideMiningProgress');
    mp.gui.chat.push('!{#FF3333}[Шахта] Добыча прервана.');
}

function finishChannel() {
    const rockIndex = channel.rockIndex;
    channel = null;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    anim.stopAllTasks();
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

let hintShown = false;
const dist2d = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

setInterval(() => {
    const p = mp.players.local.position;
    let near = null;

    if (Array.isArray(state.positions.miningRocks)) {
        state.positions.miningRocks.forEach((rock, i) => {
            if (state.miningRocksActive[i] === false) return;
            if (dist2d(p, rock) <= 3.0) near = 'rock';
        });
    }
    if (state.positions.bot && dist2d(p, state.positions.bot) <= 3.0) near = 'bot';

    if (near && !hintShown) {
        hintShown = true;
        ui.call('showInteractHint', near === 'bot' ? 'Продать руду' : 'Добывать');
    } else if (!near && hintShown) {
        hintShown = false;
        ui.call('hideInteractHint');
    }
}, 500);

mp.events.add('client:mining:sellInfo', (json) => {
    ui.call('setMiningSellInfo', JSON.parse(json));
    ui.toggleWindow('miningSell');
});

mp.events.add('client:mining:sellResult', (success, message) => {
    mp.gui.chat.push(success ? `!{#4CAF50}[Шахта] ${message}` : `!{#FF3333}[Шахта] ${message}`);
    ui.toggleWindow('miningSell');
});

mp.events.add('client:server:miningSell', () => {
    mp.events.callRemote('server:mining:sell');
});
