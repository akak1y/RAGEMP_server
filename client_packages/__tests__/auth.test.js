require('../state');
require('../auth');

describe('auth', () => {
    const state = globalThis.UIState;

    beforeEach(() => {
        jest.clearAllMocks();
        state.uiBrowser = { execute: jest.fn() };
        state.isAuthorized = false;
        state.globalKeyBlock = true;
        state.isAnyUiWindowOpen = true;
        state.openWindowsState = {
            inventory: true,
            phone: true,
            dealership: true,
            carCustom: true,
        };
        state.playerIsDeveloper = false;
    });

    test('submitLogin: пересылает логин и пароль на сервер', () => {
        mp.events.__trigger('client:account:submitLogin', 'akak', 'secret');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:account:login', 'akak', 'secret');
    });

    test('authError: показывает ошибку в браузере', () => {
        mp.events.__trigger('client:account:authError', 'Неверный пароль!');
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            'window.showAuthError("Неверный пароль!")'
        );
    });

    test('authError: кавычки в сообщении экранируются безопасно', () => {
        const msg = 'x" onclick="alert(1)';
        mp.events.__trigger('client:account:authError', msg);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            `window.showAuthError(${JSON.stringify(msg)})`
        );
    });

    test('hideAuth: сбрасывает блокировки и запрашивает позиции локаций', () => {
        mp.events.__trigger('client:account:hideAuth', 1);

        expect(state.isAuthorized).toBe(true);
        expect(state.globalKeyBlock).toBe(false);
        expect(state.isAnyUiWindowOpen).toBe(false);
        expect(state.openWindowsState).toEqual({
            inventory: false,
            phone: false,
            dealership: false,
            carCustom: false,
        });
        expect(state.playerIsDeveloper).toBe(1);

        expect(mp.gui.cursor.show).toHaveBeenCalledWith(false, false);
        expect(mp.gui.chat.show).toHaveBeenCalledWith(true);
        expect(mp.game.ui.displayRadar).toHaveBeenCalledWith(true);

        expect(mp.events.callRemote).toHaveBeenCalledWith('server:dealership:requestPos');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:courier:requestPos');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:phone:requestPriceDeliveryCar');

        expect(state.uiBrowser.execute).toHaveBeenCalledWith('window.changeScreen("game");');
    });
});
