require('../state');
require('../tuning');

describe('tuning: server-authoritative', () => {
    const state = globalThis.UIState;
    let veh;

    beforeEach(() => {
        jest.clearAllMocks();
        veh = {
            setHeading: jest.fn(),
            freezePosition: jest.fn(),
            setCollision: jest.fn(),
            setMod: jest.fn(),
            setWheelType: jest.fn(),
            setCustomPrimaryColour: jest.fn(),
        };
        mp.players.local.vehicle = veh;
        state.isAuthorized = true;
        state.isAnyUiWindowOpen = false;
        state.uiBrowser = { execute: jest.fn() };
    });

    afterEach(() => {
        mp.players.local.vehicle = null;
    });

    test('applyUpgrade: запрос уходит на сервер', () => {
        mp.events.__trigger(
            'client:custom:applyUpgrade',
            'wheels',
            '{"wheelType":0,"wheelId":5}',
            1000
        );
        expect(mp.events.callRemote).toHaveBeenCalledWith(
            'server:custom:buyUpgrade',
            'wheels',
            '{"wheelType":0,"wheelId":5}',
            1000
        );
    });

    test('applyUpgrade: визуал локально НЕ применяется (регрессия фикса)', () => {
        mp.events.__trigger(
            'client:custom:applyUpgrade',
            'wheels',
            '{"wheelType":0,"wheelId":5}',
            1000
        );
        expect(veh.setWheelType).not.toHaveBeenCalled();
        expect(veh.setMod).not.toHaveBeenCalled();
        expect(veh.setCustomPrimaryColour).not.toHaveBeenCalled();
    });

    test('applyUpgrade без машины: ничего не шлём', () => {
        mp.players.local.vehicle = null;
        mp.events.__trigger('client:custom:applyUpgrade', 'color', '{"r":1,"g":2,"b":3}', 1000);
        expect(mp.events.callRemote).not.toHaveBeenCalled();
    });

    test('startTuning: фиксирует авто и открывает окно', () => {
        mp.events.__trigger('client:custom:startTuning', 1, 2, 3, 90);
        expect(veh.setHeading).toHaveBeenCalledWith(90);
        expect(veh.freezePosition).toHaveBeenCalledWith(true);
        expect(veh.setCollision).toHaveBeenCalledWith(false, false);
        expect(state.isAnyUiWindowOpen).toBe(true);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(expect.stringContaining('carCustom'));
    });
});
