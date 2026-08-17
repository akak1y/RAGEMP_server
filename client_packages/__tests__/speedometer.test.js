jest.useFakeTimers();

require('../state');
require('../speedometer');

describe('speedometer', () => {
  const state = globalThis.UIState;

  beforeEach(() => {
    state.isAuthorized = true;
    state.uiBrowser = { execute: jest.fn() };
    mp.players.local.vehicle = null;
    jest.advanceTimersByTime(100);
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('не авторизован: ничего не шлём в Vue', () => {
    state.isAuthorized = false;
    jest.advanceTimersByTime(300);
    expect(state.uiBrowser.execute).not.toHaveBeenCalled();
  });

  test('пешком: шлём ноль и скрываем виджет', () => {
    jest.advanceTimersByTime(100);
    expect(state.uiBrowser.execute).toHaveBeenCalledWith(
      `if(window.updateSpeedometer) window.updateSpeedometer(0, '', false, 0);`
    );
  });

  test('первый тик в машине: скорость 0, модель и топливо переданы', () => {
    mp.players.local.vehicle = {
      position: new mp.Vector3(0, 0, 0),
      model: 'adder',
      getVariable: jest.fn(() => 50)
    };
    jest.advanceTimersByTime(100);
    expect(state.uiBrowser.execute).toHaveBeenCalledWith(
      `if(window.updateSpeedometer) window.updateSpeedometer(0, 'adder', true, 50);`
    );
  });

  test('движение: скорость считается из дельты позиции', () => {
    const veh = {
      position: new mp.Vector3(0, 0, 0),
      model: 'adder',
      getVariable: jest.fn(() => 50)
    };
    mp.players.local.vehicle = veh;
    jest.advanceTimersByTime(100);
    veh.position = new mp.Vector3(1, 0, 0);
    jest.advanceTimersByTime(100);
    expect(state.uiBrowser.execute).toHaveBeenLastCalledWith(
      `if(window.updateSpeedometer) window.updateSpeedometer(36, 'adder', true, 50);`
    );
  });

  test('вышел из машины: виджет скрыт, скорость сброшена', () => {
    const veh = {
      position: new mp.Vector3(0, 0, 0),
      model: 'adder',
      getVariable: jest.fn(() => 50)
    };
    mp.players.local.vehicle = veh;
    jest.advanceTimersByTime(200);
    mp.players.local.vehicle = null;
    jest.advanceTimersByTime(100);
    expect(state.uiBrowser.execute).toHaveBeenLastCalledWith(
      `if(window.updateSpeedometer) window.updateSpeedometer(0, '', false, 0);`
    );
    
    mp.players.local.vehicle = {
      position: new mp.Vector3(50, 50, 50),
      model: 'adder',
      getVariable: jest.fn(() => 50)
    };
    jest.advanceTimersByTime(100);
    expect(state.uiBrowser.execute).toHaveBeenLastCalledWith(
      `if(window.updateSpeedometer) window.updateSpeedometer(0, 'adder', true, 50);`
    );
  });
});