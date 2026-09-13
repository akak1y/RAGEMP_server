require('../state');
require('../keys');

const state = globalThis.UIState;

const fireRender = () => {
    (mp.events.__handlers.get('render') || []).forEach((fn) => fn());
};

describe('keys: блокировка ближнего боя по оружию', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.isAuthorized = true;
        state.isAnyUiWindowOpen = false;
    });

    test('с оружием: рукопашные контролы заблокированы', () => {
        mp.players.local.weapon = 0x1b06d571; // пистолет
        fireRender();
        expect(mp.game.controls.disableControlAction).toHaveBeenCalledWith(0, 140, true);
        expect(mp.game.controls.disableControlAction).toHaveBeenCalledWith(0, 141, true);
    });

    test('без оружия: ничего не блокируем и не спамим в чат', () => {
        mp.players.local.weapon = 0xa2719263; // unarmed
        fireRender();
        expect(mp.game.controls.disableControlAction).not.toHaveBeenCalled();
        expect(mp.gui.chat.push).not.toHaveBeenCalled();
    });
});
