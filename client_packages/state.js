/**
 * Общее состояние клиента.
 */
globalThis.UIState = {
    uiBrowser: null,
    isAuthorized: false,
    globalKeyBlock: false,
    windowDebug: false,
    playerIsDeveloper: false,
    isCameraRotateActive: false,
    isAnyUiWindowOpen: false,
    openWindowsState: {
        inventory: false,
        phone: false,
        dealership: false,
        carCustom: false
    },
    positions: {
        dealership: null,
        garage: null,
        carCustom: null,
        fuel: null,
        courierStart: null,
        courierTarget: null
    },
    courierMarker: null,
    courierBlip: null
};