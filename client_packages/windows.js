const state = globalThis.UIState;

/**
 * Состояние окон UI: блокировка чата, выход из LSC.
 */

mp.events.add('client:ui:windowStateChanged', (winName, isOpen) => {
    // выключаем/включаем чат при открытии/закрытии любого окна
    if (state.openWindowsState.hasOwnProperty(winName)) {
        state.openWindowsState[winName] = isOpen;
    }
    state.isAnyUiWindowOpen = Object.values(state.openWindowsState).some((v) => v === true);

    if (state.isAnyUiWindowOpen) {
        mp.gui.chat.activate(false);
    } else {
        mp.gui.chat.activate(true);
    }
    if (winName === 'carCustom' && isOpen === false) {
        // если из LSC
        state.isCameraRotateActive = false;
        if (mp.players.local.vehicle) {
            // возвращаем коллизию и размораживаем
            mp.players.local.vehicle.freezePosition(false);
            mp.players.local.vehicle.setCollision(true, true);
        }
        mp.events.callRemote('server:custom:exitShop');
    }
});
