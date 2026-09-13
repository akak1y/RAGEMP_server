require('./ui');
require('./natives');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;

const UNARMED_HASH = 0xa2719263;
const MELEE_CONTROLS = [140, 141, 142];

/**
 * Бинды клавиш (T/Enter/Esc/F5/Ё/I/P) и заморозка игрока при открытом UI.
 * Клавиша E отдельно в interactions.js.
 */

setInterval(() => {
    if (state.windowDebug && state.uiBrowser) {
        ui.call(
            'updateDebugCoords',
            mp.players.local.position.x,
            mp.players.local.position.y,
            mp.players.local.position.z,
            mp.players.local.getHeading(true)
        );
    }
}, 300);

mp.keys.bind(0x54, false, () => {
    // срабатывает на отпускание T
    if (!state.isAuthorized || state.isAnyUiWindowOpen) return;
    state.globalKeyBlock = true;
});
mp.keys.bind(0x0d, true, () => {
    // enter
    if (!state.isAuthorized) return;
    setTimeout(() => {
        state.globalKeyBlock = false;
    }, 60);
});
mp.keys.bind(0x1b, true, () => {
    // escape
    if (!state.isAuthorized) return;
    if (state.openWindowsState.carCustom && state.isCameraRotateActive) {
        state.isCameraRotateActive = false;
        natives.showCursor(true);
        natives.disableAllControls();
        return;
    }
    setTimeout(() => {
        state.globalKeyBlock = false;
    }, 60);
    if (state.isAnyUiWindowOpen) {
        for (const key of Object.keys(state.openWindowsState)) {
            state.openWindowsState[key] = false;
        }
        setTimeout(() => {
            state.isAnyUiWindowOpen = false;
        }, 170);
    }
});
mp.keys.bind(0x74, true, () => {
    // F5 - дебаг окно
    if (!state.isAuthorized || !state.playerIsDeveloper) return;
    state.windowDebug = !state.windowDebug;
    ui.call('toggleDebug', state.windowDebug);
});
mp.keys.bind(0xc0, true, () => {
    // Ё - включаем курсор
    if (!state.isAuthorized || !state.openWindowsState.carCustom) return;
    state.isCameraRotateActive = !state.isCameraRotateActive;
    if (state.isCameraRotateActive) {
        natives.showCursor(false);
    } else {
        natives.showCursor(true);
    }
});

mp.keys.bind(0x49, true, () => {
    // I - инвентарь
    if (!state.isAuthorized || state.globalKeyBlock) return;
    if (!state.openWindowsState.inventory && state.isAnyUiWindowOpen) return;
    ui.toggleWindow('inventory');
});

mp.keys.bind(0x50, true, () => {
    // P - телефон
    if (!state.isAuthorized || state.globalKeyBlock) return;
    if (!state.openWindowsState.phone && state.isAnyUiWindowOpen) return;
    mp.events.callRemote('server:phone:requestCars');
    ui.call('setPayDeliveryCar', true);
    ui.toggleWindow('phone');
});

mp.keys.bind(0x52, true, () => {
    // R - перезарядка (с оружием в руках)
    if (!state.isAuthorized || state.globalKeyBlock || state.isAnyUiWindowOpen) return;
    const w = mp.players.local.weapon;
    if (!w || w === mp.game.joaat('unarmed')) return;
    mp.events.callRemote('server:weapon:reload');
});

mp.events.add('render', () => {
    if (state.isAuthorized && state.isAnyUiWindowOpen) {
        natives.disableMovementControls();
    }
    if (state.isAuthorized && mp.players.local.weapon !== UNARMED_HASH) {
        for (const id of MELEE_CONTROLS) {
            mp.game.controls.disableControlAction(0, id, true);
        }
    }
});
