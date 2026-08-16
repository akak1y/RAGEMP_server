const state = globalThis.UIState;

/**
 * LSC-тюнинг: фиксация авто в зоне и визуальное применение модификаций.
 */

mp.events.add('client:custom:startTuning', (boxX, boxY, boxZ, boxH) => { // при заезде в LSC - фиксируем авто
    if (!state.isAuthorized || !mp.players.local.vehicle) return;
    const veh = mp.players.local.vehicle;
    veh.position = new mp.Vector3(boxX, boxY, boxZ);
    veh.setHeading(boxH);
    veh.freezePosition(true);
    veh.setCollision(false, false);

    state.isAnyUiWindowOpen = true;
    if (state.uiBrowser) state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('carCustom');`);
    mp.gui.cursor.show(true, true); // включаем курсор
});

mp.events.add('client:custom:applyUpgrade', (categoryKey, optionJson, price) => { // применяем изменения LSC
    if (!mp.players.local.vehicle) return;

    const veh = mp.players.local.vehicle;
    const option = JSON.parse(optionJson);

    if (categoryKey === 'color') { // если покраска
        veh.setCustomPrimaryColour(option.r, option.g, option.b);
        veh.setCustomSecondaryColour(option.r, option.g, option.b)
    }
    if (categoryKey === 'wheels') {
        veh.setWheelType(option.wheelType);
        veh.setMod(23, option.wheelId);
    }
    if (categoryKey === 'engine' || categoryKey === 'brakes' ||
        categoryKey === 'transmission' || categoryKey === 'turbo') {
        const modTypeMap = { engine: 11, brakes: 12, transmission: 13, turbo: 18 };
        const modType = modTypeMap[categoryKey];
        const maxLevels = { 11: 3, 12: 2, 13: 2, 18: 0 };
        veh.setMod(modType, maxLevels[modType]);
    }
    mp.events.callRemote('server:custom:buyUpgrade', categoryKey, optionJson, price) // запрос для списания денег и сохранения изменений
});