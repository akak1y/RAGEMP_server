require('./natives');
const natives = globalThis.natives;
const state = globalThis.UIState;

/**
 * Состояние окон UI: флаг открытых окон, выход из LSC.
 */

mp.events.add('client:ui:windowStateChanged', (winName, isOpen) => {
    if (state.openWindowsState.hasOwnProperty(winName)) {
        state.openWindowsState[winName] = isOpen;
    }
    state.isAnyUiWindowOpen = Object.values(state.openWindowsState).some((v) => v === true);
    if (winName === 'carCustom' && isOpen === false) {
        // если из LSC
        state.isCameraRotateActive = false;
        if (mp.players.local.vehicle) {
            // возвращаем коллизию и размораживаем
            natives.freezeVehicle(mp.players.local.vehicle, false);
        }
        mp.events.callRemote('server:custom:exitShop');
    }
});
