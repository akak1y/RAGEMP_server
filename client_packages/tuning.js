require('./ui');
require('./natives');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;
const interactions = globalThis.interactions;

/**
 * LSC-тюнинг: фиксация авто в зоне и визуальное применение модификаций.
 */

mp.events.add('client:custom:startTuning', (boxX, boxY, boxZ, boxH) => {
    // при заезде в LSC - фиксируем авто
    if (!state.isAuthorized || !mp.players.local.vehicle) return;
    const veh = mp.players.local.vehicle;
    veh.position = new mp.Vector3(boxX, boxY, boxZ);
    veh.setHeading(boxH);
    natives.freezeVehicle(veh, true);

    state.isAnyUiWindowOpen = true;
    ui.toggleWindow('carCustom');
    natives.showCursor(true);
});

mp.events.add('client:custom:applyUpgrade', (categoryKey, optionJson, price) => {
    if (!mp.players.local.vehicle) return;
    mp.events.callRemote('server:custom:buyUpgrade', categoryKey, optionJson, price);
});

// --- зоны тюнинга ---

// вход в LSC
interactions.register({
    getPositions: () => [state.positions.carCustom],
    onInteract: () => mp.events.callRemote('server:customCar:enterTuning'),
});
