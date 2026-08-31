require('../speedometer');

const state = globalThis.UIState;

describe('speedometer', () => {
    beforeEach(() => {
        state.isAuthorized = true;
        state.uiBrowser = { execute: jest.fn() };
        mp.players.local.vehicle = null;
        jest.advanceTimersByTime(100);
        jest.clearAllMocks();
    });

    test('не авторизован: ничего не шлём в Vue', () => {
        state.isAuthorized = false;
        jest.advanceTimersByTime(300);
        expect(state.uiBrowser.execute).not.toHaveBeenCalled();
    });

    test('пешком: шлём ноль и скрываем виджет', () => {
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('updateSpeedometer(0,"",false,0)')
        );
    });

    test('первый тик в машине: скорость 0, модель и топливо переданы', () => {
        mp.players.local.vehicle = {
            model: 'adder',
            position: { x: 0, y: 0, z: 0 },
            getVariable: jest.fn(() => 50),
        };
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('updateSpeedometer(0,"adder",true,50)')
        );
    });

    test('движение: скорость считается из дельты позиции', () => {
        const veh = {
            model: 'adder',
            position: { x: 0, y: 0, z: 0 },
            getVariable: jest.fn(() => 50),
        };
        mp.players.local.vehicle = veh;
        jest.advanceTimersByTime(100);
        veh.position = new mp.Vector3(1, 0, 0);
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenLastCalledWith(
            expect.stringContaining('updateSpeedometer(36,"adder",true,50)')
        );
    });

    test('вышел из машины: виджет скрыт, скорость сброшена', () => {
        mp.players.local.vehicle = {
            model: 'adder',
            position: { x: 0, y: 0, z: 0 },
            getVariable: jest.fn(() => 50),
        };
        jest.advanceTimersByTime(200);
        mp.players.local.vehicle = null;
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenLastCalledWith(
            expect.stringContaining('updateSpeedometer(0,"",false,0)')
        );
    });
});
