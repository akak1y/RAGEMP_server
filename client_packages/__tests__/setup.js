/**
 * Глобальный мок RAGE MP клиентского API для Jest.
 */

jest.useFakeTimers();
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

const handlers = new Map();

global.mp = {
    Vector3,

    events: {
        add: (name, fn) => {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push(fn);
        },
        addDataHandler: jest.fn(),
        call: jest.fn(),
        callRemote: jest.fn(),
        __trigger: (name, ...args) => {
            (handlers.get(name) || []).forEach((fn) => fn(...args));
        },
        __handlers: handlers,
    },

    keys: { bind: jest.fn() },

    gui: {
        chat: { show: jest.fn(), activate: jest.fn(), push: jest.fn() },
        cursor: { show: jest.fn() },
    },

    game: {
        ui: { displayRadar: jest.fn() },
        controls: {
            disableControlAction: jest.fn(),
            enableControlAction: jest.fn(),
            disableAllControlActions: jest.fn(),
        },
        gameplay: { getDistanceBetweenCoords: jest.fn(() => 0) },
        vehicle: { getDisplayNameFromVehicleModel: jest.fn(() => 'adder') },
        ped: { setBlockingOfNonTemporaryEvents: jest.fn() },
    },

    browsers: {
        new: jest.fn(() => ({ execute: jest.fn() })),
    },

    players: {
        local: {
            position: new Vector3(),
            vehicle: null,
            getHeading: jest.fn(() => 0),
        },
    },

    peds: { atRemoteId: jest.fn(() => null) },
    vehicles: { exists: jest.fn(() => false) },
    markers: { new: jest.fn(() => ({ destroy: jest.fn() })) },
    blips: { new: jest.fn(() => ({ destroy: jest.fn() })) },
};

globalThis.UIState = {
    uiBrowser: null,
    isAuthorized: false,
    globalKeyBlock: false,
    windowDebug: false,
    playerIsDeveloper: false,
    isCameraRotateActive: false,
    isAnyUiWindowOpen: false,
    miningRocksActive: [],
    openWindowsState: {
        inventory: false,
        phone: false,
        dealership: false,
        carCustom: false,
        shop: false,
    },
    positions: {
        dealership: null,
        garage: null,
        carCustom: null,
        fuel: null,
        courierStart: null,
        courierTarget: null,
        shop: null,
        miningRocks: [],
        bot: null,
    },
};
