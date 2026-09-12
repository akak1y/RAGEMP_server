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
    miningRocksActive: [],
    interactionHints: {},
    openWindowsState: {
        inventory: false,
        phone: false,
        dealership: false,
        carCustom: false,
        shop: false,
        miningSell: false,
        hospital: false,
        faction: false,
    },
    positions: {
        dealership: null,
        garage: null,
        carCustom: null,
        fuel: null,
        courierStart: null,
        courierTarget: null,
        shop: null,
        mafiaBase: null,
        hospital: null,
    },
};
