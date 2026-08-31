require('./ui');
require('./natives');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;

/**
 * Авторизация: отправка логина, ошибки, успешный вход.
 */

mp.events.add('client:account:submitLogin', (username, password) => {
    mp.events.callRemote('server:account:login', username, password);
});

mp.events.add('client:account:authError', (msg) => {
    ui.call('showAuthError', msg);
});

mp.events.add('client:account:hideAuth', (developer) => {
    natives.showCursor(false);
    natives.setRadar(true);
    mp.gui.chat.show(true);
    state.isAuthorized = true;
    state.globalKeyBlock = false;
    state.isAnyUiWindowOpen = false;
    state.openWindowsState = {
        inventory: false,
        phone: false,
        dealership: false,
        carCustom: false,
    };
    mp.events.callRemote('server:locations:requestAll');

    ui.call('changeScreen', 'game');
    state.playerIsDeveloper = developer;
});
