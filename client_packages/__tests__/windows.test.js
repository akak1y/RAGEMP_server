require('../state');
require('../windows');

describe('windows: windowStateChanged', () => {
    const state = globalThis.UIState;

    beforeEach(() => {
        jest.clearAllMocks();
        state.openWindowsState = {
            inventory: false,
            phone: false,
            dealership: false,
            carCustom: false,
        };
        state.isAnyUiWindowOpen = false;
    });

    test('открытие окна → чат отключён', () => {
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', true);
        expect(state.isAnyUiWindowOpen).toBe(true);
        expect(mp.gui.chat.activate).toHaveBeenCalledWith(false);
    });

    test('закрытие последнего окна → чат включён', () => {
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', true);
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', false);
        expect(state.isAnyUiWindowOpen).toBe(false);
        expect(mp.gui.chat.activate).toHaveBeenLastCalledWith(true);
    });

    test('чат не включается, пока открыто второе окно', () => {
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', true);
        mp.events.__trigger('client:ui:windowStateChanged', 'phone', true);
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', false);
        expect(state.isAnyUiWindowOpen).toBe(true);
        expect(mp.gui.chat.activate).toHaveBeenLastCalledWith(false);
    });
});
