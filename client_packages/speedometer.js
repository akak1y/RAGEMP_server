require('./ui');

const state = globalThis.UIState;
const ui = globalThis.ui;

/**
 * Спидометр: скорость из дельты позиции + топливо, отправка в Vue каждые 100 мс.
 */

let spdLastPos = null;
let spdLastTime = 0;

setInterval(() => {
    if (!state.isAuthorized || !state.uiBrowser) return;
    const veh = mp.players.local.vehicle;
    if (!veh) {
        spdLastPos = null;
        spdLastTime = 0;
        ui.call('updateSpeedometer', 0, '', false, 0);
        return;
    }

    const now = Date.now();
    const pos = veh.position;
    let kmh = 0;
    if (spdLastPos && spdLastTime) {
        const dt = (now - spdLastTime) / 1000;
        if (dt > 0) {
            kmh = Math.round(
                (Math.hypot(pos.x - spdLastPos.x, pos.y - spdLastPos.y, pos.z - spdLastPos.z) /
                    dt) *
                    3.6
            );
        }
    }
    spdLastPos = pos;
    spdLastTime = now;

    let name = '';
    try {
        name = mp.game.vehicle.getDisplayNameFromVehicleModel(veh.model).toLowerCase();
    } catch (e) {}
    const fuel = typeof veh.getVariable === 'function' ? Number(veh.getVariable('fuel') || 0) : 0;
    ui.call('updateSpeedometer', kmh, name, true, fuel);
}, 100);
