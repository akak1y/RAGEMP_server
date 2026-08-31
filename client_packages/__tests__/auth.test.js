require('../auth');

const state = globalThis.UIState;

describe('auth', () => {
    beforeEach(() => {
        state.isAuthorized = false;
        state.uiBrowser = { execute: jest.fn() };
        jest.clearAllMocks();
    });

    test('submitLogin: пересылает данные на сервер', () => {
        mp.events.__trigger('client:account:submitLogin', 'user', 'pass');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:account:login', 'user', 'pass');
    });

    test('authError: показывает ошибку в браузере', () => {
        mp.events.__trigger('client:account:authError', 'Неверный пароль!');
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('showAuthError("Неверный пароль!")')
        );
    });

    test('authError: кавычки в сообщении экранируются безопасно', () => {
        const msg = 'x" onclick="alert(1)';
        mp.events.__trigger('client:account:authError', msg);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('showAuthError("x\\" onclick=\\"alert(1)")')
        );
    });

    test('hideAuth: сбрасывает блокировки и запрашивает позиции локаций', () => {
        mp.events.__trigger('client:account:hideAuth', true);
        expect(state.isAuthorized).toBe(true);
        expect(state.globalKeyBlock).toBe(false);
        expect(state.playerIsDeveloper).toBe(true);
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:locations:requestAll');

        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('changeScreen("game")')
        );
    });
});
