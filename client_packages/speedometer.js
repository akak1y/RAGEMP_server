require('./ui');
require('./natives');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;

/**
 * Спидометр: скорость из дельты позиции + топливо.
 * В Vue уходит только при изменении значений (дедупликация).
 */

let spdLastPos = null;
let spdLastTime = 0;
let lastSent = null;

function send(kmh, name, inVehicle, fuel) {
    if (
        lastSent &&
        lastSent[0] === kmh &&
        lastSent[1] === name &&
        lastSent[2] === inVehicle &&
        lastSent[3] === fuel
    ) {
        return;
    }
    lastSent = [kmh, name, inVehicle, fuel];
    ui.call('updateSpeedometer', kmh, name, inVehicle, fuel);
}

setInterval(() => {
    if (!state.isAuthorized || !state.uiBrowser) return;
    const veh = mp.players.local.vehicle;
    if (!veh) {
        spdLastPos = null;
        spdLastTime = 0;
        send(0, '', false, 0);
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

    const name = natives.getVehicleModelName(veh.model);
    const fuel = typeof veh.getVariable === 'function' ? Number(veh.getVariable('fuel') || 0) : 0;
    send(kmh, name, true, fuel);
}, 100);
