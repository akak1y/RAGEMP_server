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
        state.isCameraRotateActive = false;
        mp.players.local.vehicle = null;
    });
    test('открытие окна ставит флаг', () => {
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', true);
        expect(state.isAnyUiWindowOpen).toBe(true);
    });
    test('закрытие последнего окна снимает флаг', () => {
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', true);
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', false);
        expect(state.isAnyUiWindowOpen).toBe(false);
    });
    test('флаг жив, пока открыто второе окно', () => {
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', true);
        mp.events.__trigger('client:ui:windowStateChanged', 'phone', true);
        mp.events.__trigger('client:ui:windowStateChanged', 'inventory', false);
        expect(state.isAnyUiWindowOpen).toBe(true);
    });
    test('выход из LSC: сброс камеры и выход на сервере', () => {
        const veh = { freezePosition: jest.fn(), setCollision: jest.fn() };
        mp.players.local.vehicle = veh;
        state.openWindowsState.carCustom = true;
        state.isCameraRotateActive = true;
        mp.events.__trigger('client:ui:windowStateChanged', 'carCustom', false);
        expect(state.isCameraRotateActive).toBe(false);
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:custom:exitShop');
    });
});
