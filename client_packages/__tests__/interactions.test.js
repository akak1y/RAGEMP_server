require('../state');
require('../interactions');

const state = globalThis.UIState;
const interactions = globalThis.interactions;
// E-обработчик биндится один раз при загрузке модуля — берём до сброса моков
const pressE = mp.keys.bind.mock.calls.find((c) => c[0] === 0x45)[2];

const realDistance = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, ay - by, az - bz);

describe('interactions: доступность зон по способу передвижения', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.isAuthorized = true;
        state.globalKeyBlock = false;
        state.isAnyUiWindowOpen = false;
        state.uiBrowser = { execute: jest.fn() };
        mp.players.local.vehicle = null;
        mp.players.local.position = new mp.Vector3(0, 0, 0);
        mp.game.gameplay.getDistanceBetweenCoords.mockImplementation(realDistance);
    });

    test('foot-зона: E работает пешком и не работает в машине', () => {
        const onInteract = jest.fn();
        interactions.register({
            radius: 3,
            mode: 'foot',
            getPositions: () => [{ x: 100, y: 100, z: 0 }],
            getHint: () => 'Автосалон',
            onInteract,
        });
        mp.players.local.position = new mp.Vector3(100, 100, 0);
        pressE();
        expect(onInteract).toHaveBeenCalledTimes(1);

        mp.players.local.vehicle = { model: 'adder' };
        pressE();
        expect(onInteract).toHaveBeenCalledTimes(1); // второго вызова нет
    });

    test('vehicle-зона: E работает только из машины', () => {
        const onInteract = jest.fn();
        interactions.register({
            radius: 3,
            mode: 'vehicle',
            getPositions: () => [{ x: 200, y: 200, z: 0 }],
            getHint: () => 'Заправка',
            onInteract,
        });
        mp.players.local.position = new mp.Vector3(200, 200, 0);
        pressE();
        expect(onInteract).not.toHaveBeenCalled();

        mp.players.local.vehicle = { model: 'adder' };
        pressE();
        expect(onInteract).toHaveBeenCalledTimes(1);
    });

    test('подсказка: пешком показана, в машине скрыта', () => {
        interactions.register({
            radius: 3,
            mode: 'foot',
            getPositions: () => [{ x: 300, y: 300, z: 0 }],
            getHint: () => 'Магазин',
            onInteract: () => {},
        });
        mp.players.local.position = new mp.Vector3(300, 300, 0);
        jest.advanceTimersByTime(500);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('showInteractHint')
        );

        mp.players.local.vehicle = { model: 'adder' };
        jest.advanceTimersByTime(500);
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('hideInteractHint')
        );
    });
});
