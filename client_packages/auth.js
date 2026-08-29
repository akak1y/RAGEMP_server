require('./natives');
const natives = globalThis.natives;
const state = globalThis.UIState;

/**
 * Авторизация: отправка логина, ошибки, успешный вход.
 */

mp.events.add('client:account:submitLogin', (username, password) => {
    // кнопка войти
    mp.events.callRemote('server:account:login', username, password); // пересылаем на сервер для проверки
});

mp.events.add('client:account:authError', (msg) => {
    // ошибка авторизации
    if (state.uiBrowser) state.uiBrowser.execute(`window.showAuthError(${JSON.stringify(msg)})`);
});

mp.events.add('client:account:hideAuth', (developer) => {
    // успешная авторизация
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
    mp.events.callRemote('server:dealership:requestPos');
    mp.events.callRemote('server:garage:requestPos');
    mp.events.callRemote('server:customCar:requestPos');
    mp.events.callRemote('server:fuel:requestPos');
    mp.events.callRemote('server:courier:requestPos');
    mp.events.callRemote('server:shop:requestPos');
    mp.events.callRemote('server:mining:requestPos');
    mp.events.callRemote('server:phone:requestPriceDeliveryCar');
    if (state.uiBrowser) state.uiBrowser.execute(`window.changeScreen("game");`); // меняем окно авторизации на игровой худ
    state.playerIsDeveloper = developer;
});
