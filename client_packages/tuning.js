const state = globalThis.UIState;

/**
 * LSC-тюнинг: фиксация авто в зоне и визуальное применение модификаций.
 */

mp.events.add('client:custom:startTuning', (boxX, boxY, boxZ, boxH) => {
    // при заезде в LSC - фиксируем авто
    if (!state.isAuthorized || !mp.players.local.vehicle) return;
    const veh = mp.players.local.vehicle;
    veh.position = new mp.Vector3(boxX, boxY, boxZ);
    veh.setHeading(boxH);
    veh.freezePosition(true);
    veh.setCollision(false, false);

    state.isAnyUiWindowOpen = true;
    if (state.uiBrowser)
        state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('carCustom');`);
    mp.gui.cursor.show(true, true); // включаем курсор
});

mp.events.add('client:custom:applyUpgrade', (categoryKey, optionJson, price) => {
    // запрос на сервер
    if (!mp.players.local.vehicle) return;
    mp.events.callRemote('server:custom:buyUpgrade', categoryKey, optionJson, price);
});
