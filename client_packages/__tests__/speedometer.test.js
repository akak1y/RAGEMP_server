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
        mp.players.local.vehicle = {
            model: 'adder',
            position: new mp.Vector3(0, 0, 0),
            getVariable: () => 50,
        };
        jest.advanceTimersByTime(300);
        expect(state.uiBrowser.execute).not.toHaveBeenCalled();
    });

    test('пешком: повторные тики молчат (дедупликация)', () => {
        jest.advanceTimersByTime(100);
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).not.toHaveBeenCalled();
    });

    test('сел в машину: шлём скорость, модель и топливо', () => {
        mp.players.local.vehicle = {
            model: 'adder',
            position: new mp.Vector3(0, 0, 0),
            getVariable: () => 50,
        };
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('updateSpeedometer(0,"adder",true,50)')
        );
    });

    test('движение: скорость считается из дельты позиции', () => {
        const veh = {
            model: 'adder',
            position: new mp.Vector3(0, 0, 0),
            getVariable: () => 50,
        };
        mp.players.local.vehicle = veh;
        jest.advanceTimersByTime(100);
        jest.clearAllMocks();

        veh.position = new mp.Vector3(1, 0, 0);
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenLastCalledWith(
            expect.stringContaining('updateSpeedometer(36,"adder",true,50)')
        );
    });

    test('изменилось топливо: шлём обновление', () => {
        const veh = {
            model: 'adder',
            position: new mp.Vector3(0, 0, 0),
            getVariable: () => 50,
        };
        mp.players.local.vehicle = veh;
        jest.advanceTimersByTime(100);
        jest.clearAllMocks();

        veh.getVariable = () => 49;
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('updateSpeedometer(0,"adder",true,49)')
        );
    });

    test('вышел из машины: шлём скрытие виджета', () => {
        mp.players.local.vehicle = {
            model: 'adder',
            position: new mp.Vector3(0, 0, 0),
            getVariable: () => 50,
        };
        jest.advanceTimersByTime(200);
        jest.clearAllMocks();

        mp.players.local.vehicle = null;
        jest.advanceTimersByTime(100);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('updateSpeedometer(0,"",false,0)')
        );
    });
});
