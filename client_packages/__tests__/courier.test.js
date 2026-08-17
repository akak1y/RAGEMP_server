require('../state');
require('../courier');

describe('courier: target', () => {
    const state = globalThis.UIState;

    beforeEach(() => {
        jest.clearAllMocks();
        state.positions.courierTarget = null;
    });

    test('доставка: маркер и blip созданы', () => {
        mp.events.__trigger('client:courier:target', 100, 200, 30, 'delivery');
        expect(mp.markers.new).toHaveBeenCalledTimes(1);
        expect(mp.blips.new).toHaveBeenCalledTimes(1);
        expect(state.positions.courierTarget).toEqual({ x: 100, y: 200, z: 30 });
    });

    test('доставка: blip с названием и дальней видимостью', () => {
        mp.events.__trigger('client:courier:target', 1, 2, 3, 'delivery');
        const blip = mp.blips.new.mock.results[0].value;
        expect(blip.shortRange).toBe(false);
        expect(blip.name).toBe('Доставка');
    });

    test('склад (pickup): маркер создан, blip нет', () => {
        mp.events.__trigger('client:courier:target', 10, 20, 30, 'pickup');
        expect(mp.markers.new).toHaveBeenCalledTimes(1);
        expect(mp.blips.new).not.toHaveBeenCalled();
    });

    test('размер маркера зависит от этапа', () => {
        mp.events.__trigger('client:courier:target', 1, 1, 1, 'delivery');
        mp.events.__trigger('client:courier:target', 2, 2, 2, 'return');
        expect(mp.markers.new.mock.calls[0][2]).toBe(1.0);
        expect(mp.markers.new.mock.calls[1][2]).toBe(2.5);
    });

    test('новая цель уничтожает старые маркер и blip', () => {
        mp.events.__trigger('client:courier:target', 1, 1, 1, 'delivery');
        const oldMarker = mp.markers.new.mock.results[0].value;
        const oldBlip = mp.blips.new.mock.results[0].value;
        mp.events.__trigger('client:courier:target', 5, 5, 5, 'delivery');
        expect(oldMarker.destroy).toHaveBeenCalled();
        expect(oldBlip.destroy).toHaveBeenCalled();
    });

    test('null-цель: позиция очищена, новые маркеры не создаются', () => {
        mp.events.__trigger('client:courier:target', 1, 1, 1, 'delivery');
        mp.events.__trigger('client:courier:target', null);
        expect(state.positions.courierTarget).toBeNull();
        expect(mp.markers.new).toHaveBeenCalledTimes(1);
    });
});