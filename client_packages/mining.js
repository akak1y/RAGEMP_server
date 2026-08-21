const state = globalThis.UIState;

/**
 * Шахта: ченнелинг добычи и продажа руды боту.
 */

const HAMMER_DICT = 'amb@world_human_hammering@male@';
const HAMMER_ANIM = 'hammer_a';

let channel = null;
let progressTimer = null;
let dustTimer = null;
let pickaxe = null;

mp.events.add('client:mining:setData', (json) => {
    try {
        const data = JSON.parse(json);
        state.positions.miningRocks = (data.rocks || []).map((r) => new mp.Vector3(r.x, r.y, r.z));
        state.positions.bot = new mp.Vector3(data.botPos.x, data.botPos.y, data.botPos.z);
    } catch (e) {
        mp.gui.chat.push('!{#FF3333}[Шахта] Ошибка данных локаций');
    }
});

function playMiningAnim(durationMs) {
    try {
        mp.players.local.taskStartScenarioInPlace('WORLD_HUMAN_CONST_DRILL', -1, true);
        return;
    } catch (e) {}

    try {
        mp.game.streaming.requestAnimDict(HAMMER_DICT);
    } catch (e) {
        return;
    }
    setTimeout(() => {
        try {
            mp.players.local.taskPlayAnim(
                HAMMER_DICT,
                HAMMER_ANIM,
                8.0,
                -8.0,
                durationMs,
                1,
                0,
                false,
                false
            );
        } catch (e) {}
    }, 500);
}

function stopAllTasks() {
    const p = mp.players.local;
    try {
        p.clearTasks();
        return;
    } catch (e) {}
    try {
        mp.game.ped.clearPedTasks(p.handle);
        return;
    } catch (e) {}
    try {
        p.clearTasksImmediately();
    } catch (e) {}
}

function attachPickaxe() {
    setTimeout(() => {
        try {
            const hash = mp.game.joaat('prop_tool_pickaxe');
            const p = mp.players.local.position;
            pickaxe = mp.objects.new(
                hash,
                new mp.Vector3(p.x, p.y, p.z - 5),
                new mp.Vector3(0, 0, 0)
            );
            pickaxe.attachTo(
                mp.players.local,
                57005,
                new mp.Vector3(0.08, 0.02, 0.05),
                new mp.Vector3(15, 0, 60),
                false,
                false,
                false,
                0,
                false
            );
        } catch (e) {}
    }, 300);
}

function spawnDust() {
    try {
        const p = mp.players.local.position;
        mp.game.graphics.requestNamedPtfxAsset('core');
        mp.game.graphics.useParticleFxAssetNext('core');
        mp.game.graphics.startParticleFxNonLoopedAtCoord(
            'ent_dst_dust',
            p.x,
            p.y,
            p.z - 0.8,
            0,
            0,
            0,
            0.6
        );
    } catch (e) {}
}

function setProgress(pct) {
    if (state.uiBrowser) {
        state.uiBrowser.execute(
            `if(window.updateMiningProgress) window.updateMiningProgress(${pct.toFixed(1)});`
        );
    }
}

function hideProgress() {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.hideMiningProgress) window.hideMiningProgress();`);
    }
}

function stopVisuals() {
    if (dustTimer) clearInterval(dustTimer);
    dustTimer = null;
    stopAllTasks();
    if (pickaxe) {
        try {
            pickaxe.destroy();
        } catch (e) {}
        pickaxe = null;
    }
}

function cancelChannel() {
    channel = null;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    stopVisuals();
    hideProgress();
    mp.gui.chat.push('!{#FF3333}[Шахта] Добыча прервана.');
}

function finishChannel() {
    const rockIndex = channel.rockIndex;
    channel = null;
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    stopVisuals();
    hideProgress();
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
    attachPickaxe();
    dustTimer = setInterval(spawnDust, 800);

    progressTimer = setInterval(() => {
        if (!channel) return;
        const pct = Math.min(100, ((Date.now() - channel.startedAt) / channel.durationMs) * 100);
        setProgress(pct);

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
    if (!state.uiBrowser) return;
    state.uiBrowser.execute(`
        if(window.setMiningSellInfo) window.setMiningSellInfo(${json});
        if(window.toggleWindow) window.toggleWindow('miningSell');
    `);
});

mp.events.add('client:mining:sellResult', (success, message) => {
    mp.gui.chat.push(success ? `!{#4CAF50}[Шахта] ${message}` : `!{#FF3333}[Шахта] ${message}`);
    if (success && state.uiBrowser) {
        state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('miningSell');`);
    }
});

mp.events.add('client:server:miningSell', () => {
    mp.events.callRemote('server:mining:sell');
});
