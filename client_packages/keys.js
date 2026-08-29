require('./natives');
const natives = globalThis.natives;
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
        natives.showCursor(true); // активируем мышь для кликов по меню
        natives.disableAllControls(); // деактивируем все контроллеры
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
        natives.showCursor(false);
    } else {
        natives.showCursor(true);
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
    if (state.isAuthorized && state.isAnyUiWindowOpen) {
        natives.disableMovementControls();
    }
    if (state.isAuthorized && state.openWindowsState.carCustom && state.isCameraRotateActive) {
        natives.enableMouseControls();
    }
});
