const state = globalThis.UIState;

/**
 * Бинды клавиш (T/Enter/Esc/F5/Ё/I/P) и заморозка игрока при открытом UI.
 * Клавиша E отдельно в interactions.js.
 */

setInterval(() => {
    if (state.windowDebug && state.uiBrowser) {
        // отправляем текущие координаты в vue
        state.uiBrowser.execute(
            `if(window.updateDebugCoords) window.updateDebugCoords(${mp.players.local.position.x}, ${mp.players.local.position.y}, ${mp.players.local.position.z}, ${mp.players.local.getHeading(true)});`
        );
    }
}, 300);

mp.keys.bind(0x54, false, () => {
    // срабатывает на отпускание T
    if (!state.isAuthorized || state.isAnyUiWindowOpen) return;
    state.globalKeyBlock = true; // закрываем доступ к окнам
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
        // если открыт автосалон
        state.isCameraRotateActive = false;
        mp.gui.cursor.show(true, true); // активируем мышь для кликов по меню
        mp.game.controls.disableAllControlActions(0); // деактивируем все контроллеры
        return;
    }
    setTimeout(() => {
        state.globalKeyBlock = false;
    }, 60);
    if (state.isAnyUiWindowOpen) {
        state.openWindowsState = {
            inventory: false,
            phone: false,
            dealership: false,
            carCustom: false,
        }; // обнуляем состояния
        setTimeout(() => {
            state.isAnyUiWindowOpen = false;
        }, 170); // с задержкой выключаем проверку
    }
});
mp.keys.bind(0x74, true, () => {
    // F5 - дебаг окно
    if (!state.isAuthorized || !state.playerIsDeveloper) return;
    state.windowDebug = !state.windowDebug;
    if (state.uiBrowser)
        state.uiBrowser.execute(`if(window.toggleDebug) window.toggleDebug(${state.windowDebug});`);
});
mp.keys.bind(0xc0, true, () => {
    // Ё - включаем курсор
    if (!state.isAuthorized || !state.openWindowsState.carCustom) return;
    state.isCameraRotateActive = !state.isCameraRotateActive;
    if (state.isCameraRotateActive) {
        mp.gui.cursor.show(false, false);
    } else {
        mp.gui.cursor.show(true, true);
    }
});

mp.keys.bind(0x49, true, () => {
    // I - инвентарь
    if (!state.isAuthorized || state.globalKeyBlock) return;
    if (!state.openWindowsState.inventory && state.isAnyUiWindowOpen) return;
    if (state.uiBrowser)
        state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('inventory');`);
});

mp.keys.bind(0x50, true, () => {
    // P - телефон
    if (!state.isAuthorized || state.globalKeyBlock) return;
    if (!state.openWindowsState.phone && state.isAnyUiWindowOpen) return;
    mp.events.callRemote('server:phone:requestCars'); // запрашиваем список авто
    if (state.uiBrowser)
        state.uiBrowser.execute(
            `if(window.setPayDeliveryCar) window.setPayDeliveryCar(true); if(window.toggleWindow) window.toggleWindow('phone');`
        );
});

mp.events.add('render', () => {
    // при открытом любом окне отключаем движение персонажа
    if (state.isAuthorized && state.isAnyUiWindowOpen) {
        mp.game.controls.disableControlAction(0, 30, true); // A/D
        mp.game.controls.disableControlAction(0, 31, true); // W/S
        mp.game.controls.disableControlAction(0, 21, true); // shift
        mp.game.controls.disableControlAction(0, 22, true); // space
        mp.game.controls.disableControlAction(0, 1, true); // мышь X
        mp.game.controls.disableControlAction(0, 2, true); // мышь Y
        mp.game.controls.disableControlAction(0, 24, true); // лкм
    }
    if (state.isAuthorized && state.openWindowsState.carCustom && state.isCameraRotateActive) {
        // если в LSC - разрешаем двигать мышью
        mp.game.controls.enableControlAction(0, 1, true); // мышь X
        mp.game.controls.enableControlAction(0, 2, true); // мышь Y
    }
});
