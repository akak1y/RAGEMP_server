/** Сценарии */
function playScenario(name) {
    try {
        mp.players.local.taskStartScenarioInPlace(name, -1, true);
        return true;
    } catch (e) {
        return false;
    }
}

function requestAnimDict(dict) {
    try {
        mp.game.streaming.requestAnimDict(dict);
        return true;
    } catch (e) {
        return false;
    }
}

function playAnim(dict, name, durationMs) {
    try {
        mp.players.local.taskPlayAnim(dict, name, 8.0, -8.0, durationMs, 1, 0, false, false);
    } catch (e) {}
}

function stopAllTasks() {
    const p = mp.players.local;
    try { p.clearTasks(); return; } catch (e) {}
    try { mp.game.ped.clearPedTasks(p.handle); return; } catch (e) {}
    try { p.clearTasksImmediately(); } catch (e) {}
}

globalThis.anim = { playScenario, requestAnimDict, playAnim, stopAllTasks };