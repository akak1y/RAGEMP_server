require('./state'); // создаём UIstate
const state = globalThis.UIState;

mp.gui.chat.show(false); // скрываем чат и миникарту
mp.game.ui.displayRadar(false);

mp.events.add("playerReady", () => { state.uiBrowser = mp.browsers.new("http://localhost:5173/") }); // подключаемся к vue сайту

setInterval(() => {
    if (state.windowDebug && state.uiBrowser) { // отправляем текущие координаты в vue
        state.uiBrowser.execute(`if(window.updateDebugCoords) window.updateDebugCoords(${mp.players.local.position.x}, ${mp.players.local.position.y}, ${mp.players.local.position.z}, ${mp.players.local.getHeading(true)});`)
    }
}, 300);

mp.keys.bind(0x54, false, () => { // срабатывает на отпускание T
    if (!state.isAuthorized || state.isAnyUiWindowOpen) return;
    state.globalKeyBlock = true // закрываем доступ к окнам
});
mp.keys.bind(0x0D, true, () => { // enter
    if (!state.isAuthorized) return;
    setTimeout(() => { state.globalKeyBlock = false }, 60)
});
mp.keys.bind(0x1B, true, () => { // escape
    if (!state.isAuthorized) return;
    if (state.openWindowsState.carCustom && state.isCameraRotateActive) { // если открыт автосалон
        state.isCameraRotateActive = false;
        mp.gui.cursor.show(true, true); // активируем мышь для кликов по меню
        mp.game.controls.disableAllControlActions(0); // деактивируем все контроллеры
        return
    }
    setTimeout(() => { state.globalKeyBlock = false }, 60);
    if (state.isAnyUiWindowOpen) {
        state.openWindowsState = { inventory: false, phone: false, dealership: false, carCustom: false }; // обнуляем состояния
        setTimeout(() => { state.isAnyUiWindowOpen = false }, 170); // с задержкой выключаем проверку
    }
});
mp.keys.bind(0x74, true, () => { // F5 - дебаг окно
    if (!state.isAuthorized || !state.playerIsDeveloper) return;
    state.windowDebug = !state.windowDebug;
    if (state.uiBrowser) state.uiBrowser.execute(`if(window.toggleDebug) window.toggleDebug(${state.windowDebug});`)
});
mp.keys.bind(0xC0, true, () => { // Ё - включаем курсор
    if (!state.isAuthorized || !state.openWindowsState.carCustom) return;
    state.isCameraRotateActive = !state.isCameraRotateActive;
    if (state.isCameraRotateActive) { mp.gui.cursor.show(false, false) }
    else { mp.gui.cursor.show(true, true) }
});

mp.events.add("browserCreated", (browser) => { // когда создался браузер
    if (state.uiBrowser && browser === state.uiBrowser){
        mp.gui.cursor.show(true, true) // включаем курсор для авторизации
    }
});

mp.events.add("client:account:submitLogin", (username, password) => { // кнопка войти
    mp.events.callRemote("server:account:login", username, password) // пересылаем на сервер для проверки
});

mp.events.add("client:account:authError", (msg) => { // ошибка авторизации
    if (state.uiBrowser) state.uiBrowser.execute(`window.showAuthError("${msg}");`); 
});

mp.events.add("client:account:hideAuth", (developer) => { // успешная авторизация
    mp.gui.cursor.show(false, false); // сбрасываем все блокировки при спавне
    mp.gui.chat.show(true);
    mp.game.ui.displayRadar(true);
    state.isAuthorized = true;
    state.globalKeyBlock = false;
    state.isAnyUiWindowOpen = false;
    state.openWindowsState = { inventory: false, phone: false, dealership: false, carCustom: false };
    mp.events.callRemote("server:dealership:requestPos");
    mp.events.callRemote("server:garage:requestPos");
    mp.events.callRemote("server:customCar:requestPos");
    mp.events.callRemote("server:fuel:requestPos");
    mp.events.callRemote("server:courier:requestPos");
    mp.events.callRemote("server:phone:requestPriceDeliveryCar");
    if (state.uiBrowser) state.uiBrowser.execute(`window.changeScreen("game");`); // меняем окно авторизации на игровой худ
    state.playerIsDeveloper = developer
});

mp.events.add("client:ui:windowStateChanged", (winName, isOpen) => { // выключаем/включаем чат при открытии/закрытии любого окна
    if (state.openWindowsState.hasOwnProperty(winName)) { state.openWindowsState[winName] = isOpen }
    state.isAnyUiWindowOpen = Object.values(state.openWindowsState).some(state => state === true);

    if (state.isAnyUiWindowOpen) { mp.gui.chat.activate(false) }
    else { mp.gui.chat.activate(true) }
    if (winName === 'carCustom' && isOpen === false) { // если из LSC
        state.isCameraRotateActive = false;
        if (mp.players.local.vehicle) { // возвращаем коллизию и размораживаем
            mp.players.local.vehicle.freezePosition(false);
            mp.players.local.vehicle.setCollision(true, true)
        }
        mp.events.callRemote('server:custom:exitShop')
    }
});

mp.events.add("render", () => { // при открытом любом окне отключаем движение персонажа
    if (state.isAuthorized && state.isAnyUiWindowOpen) {
        mp.game.controls.disableControlAction(0, 30, true); // A/D
        mp.game.controls.disableControlAction(0, 31, true); // W/S
        mp.game.controls.disableControlAction(0, 21, true); // shift
        mp.game.controls.disableControlAction(0, 22, true); // space
        mp.game.controls.disableControlAction(0, 1, true);  // мышь X
        mp.game.controls.disableControlAction(0, 2, true);  // мышь Y
        mp.game.controls.disableControlAction(0, 24, true) // лкм
    }
    if (state.isAuthorized && state.openWindowsState.carCustom && state.isCameraRotateActive) { // если в LSC - разрешаем двигать мышью
        mp.game.controls.enableControlAction(0, 1, true); // мышь X
        mp.game.controls.enableControlAction(0, 2, true); // мышь Y
    }
});

mp.keys.bind(0x49, true, () => { // I - инвентарь
    if (!state.isAuthorized || state.globalKeyBlock) return;
    if (!state.openWindowsState.inventory && state.isAnyUiWindowOpen) return;
    if (state.uiBrowser) state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('inventory');`)
});

mp.keys.bind(0x50, true, () => { // P - телефон
    if (!state.isAuthorized || state.globalKeyBlock) return;
    if (!state.openWindowsState.phone && state.isAnyUiWindowOpen) return;
    mp.events.callRemote("server:phone:requestCars"); // запрашиваем список авто
    if (state.uiBrowser) state.uiBrowser.execute(`if(window.setPayDeliveryCar) window.setPayDeliveryCar(true); if(window.toggleWindow) window.toggleWindow('phone');`)
});

mp.keys.bind(0x45, true, () => { // E - взаимодействие с маркером
    if (!state.isAuthorized || state.globalKeyBlock || state.isAnyUiWindowOpen || !state.positions.dealership || !state.positions.garage || !state.positions.carCustom) return;

    const playerPos = mp.players.local.position;
    const interactionRadius = 2.5;

    const interactionZones = [ // конфигурация зон
        {
            name: 'dealership',
            position: state.positions.dealership,
            onInteract: () => {
                mp.events.callRemote('server:dealership:requestConfig');
                if (state.uiBrowser) state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('dealership');`);
            }
        },
        {
            name: 'garage',
            position: state.positions.garage,
            onInteract: () => {
                mp.events.callRemote('server:phone:requestCars');
                if (state.uiBrowser) {
                    state.uiBrowser.execute(`
                        if(window.setPayDeliveryCar) window.setPayDeliveryCar(false);
                        if(window.toggleWindow) window.toggleWindow('phone');
                    `)
                }
            }
        },
        {
            name: 'customCar',
            position: state.positions.carCustom,
            onInteract: () => {
                mp.events.callRemote('server:customCar:enterTuning'); // входим в LSC
            }
        },
        {
            name: 'fuel',
            position: state.positions.fuel,
            onInteract: () => {
                const veh = mp.players.local.vehicle;
                if (!veh) return mp.gui.chat.push('!{#FF3333}[Заправка] Сначала сядьте в машину.');
                const dbId = veh.getVariable('dbId');
                if (!dbId) return mp.gui.chat.push('!{#FF3333}[Заправка] Это не ваша машина.');
                mp.events.callRemote('server:fuel:refuel', dbId)
            }
        },
        {
            name: 'courierStart',
            position: state.positions.courierStart,
            onInteract: () => { mp.events.callRemote('server:courier:interact'); }
        },
        {
            name: 'courierTarget',
            position: state.positions.courierTarget,
            onInteract: () => { mp.events.callRemote('server:courier:interact'); }
        },
    ];
    for (const zone of interactionZones) { // проверяем каждую зону
        if (!zone.position) continue;
        const distance = mp.game.gameplay.getDistanceBetweenCoords( playerPos.x, playerPos.y, playerPos.z, zone.position.x, zone.position.y, zone.position.z, true );
        if (distance <= interactionRadius) {
            zone.onInteract();
            break
        }
    }
});

// спидометр
let spdLastPos = null;
let spdLastTime = 0;

setInterval(() => {
    if (!state.isAuthorized || !state.uiBrowser) return;
    const veh = mp.players.local.vehicle;
    if (!veh) {
        spdLastPos = null;
        spdLastTime = 0;
        state.uiBrowser.execute(`if(window.updateSpeedometer) window.updateSpeedometer(0, '', false, 0);`);
        return;
    }

    const now = Date.now();
    const pos = veh.position;
    let kmh = 0;
    if (spdLastPos && spdLastTime) {
        const dt = (now - spdLastTime) / 1000;
        if (dt > 0) { kmh = Math.round( Math.hypot(pos.x - spdLastPos.x, pos.y - spdLastPos.y, pos.z - spdLastPos.z) / dt * 3.6 ) }
    }
    spdLastPos = pos;
    spdLastTime = now;

    let name = '';
    try { name = mp.game.vehicle.getDisplayNameFromVehicleModel(veh.model).toLowerCase(); } catch (e) {}
    const fuel = typeof veh.getVariable === 'function' ? Number(veh.getVariable('fuel') || 0) : 0;
    state.uiBrowser.execute(`if(window.updateSpeedometer) window.updateSpeedometer(${kmh}, '${name}', true, ${fuel});`);
}, 100);

// мосты для vue
mp.events.add("client:ui:debugLog", (msg, type = 'info') => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.addDebugLog) window.addDebugLog('${msg}', '${type}');`)
    }
});

mp.events.add("client:updateMoney", (money) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.updateMoney) window.updateMoney(${money});`)
    }
});

mp.events.add("client:inventory:update", (jsonSlots, jsonConfig) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.updateInventory) window.updateInventory('${jsonSlots}', '${jsonConfig}');`)
    }
});

mp.events.add("client:phone:setCarList", (carsJson, configJson) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.setPhoneCars) window.setPhoneCars('${carsJson}', '${configJson}');`)
    }
});

mp.events.add("client:setRedisStats", (count) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.updateGlobalStats) window.updateGlobalStats(${count});`)
    }
});

mp.events.add("client:dealership:setConfig", (carsJson) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.setDealershipCars) window.setDealershipCars('${carsJson}');`)
    }
});

mp.events.add("client:phone:requestPriceDeliveryCar", (price) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.setPriceDeliveryCar) window.setPriceDeliveryCar(${price});`)
    }
});

mp.events.add("client:customCar:setTuningConfig", (json) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.setTuningConfig) window.setTuningConfig('${json}');`)
    }
});

mp.events.add("client:customCar:setTuningState", (json) => {
    if (state.uiBrowser) {
        state.uiBrowser.execute(`if(window.setTuningState) window.setTuningState('${json}');`)
    }
});

mp.events.add("client:phone:updateCars", () => { mp.events.callRemote("server:phone:requestCars") });
mp.events.add("client:ui:requestStatsUpdate", () => { mp.events.callRemote("server:requestRedisStats") });
mp.events.add("client:toggleCursor", (toggle) => { mp.gui.cursor.show(toggle, toggle) });
mp.events.add("client:server:buyCar", (model) => { mp.events.callRemote("server:dealership:buy", model) }); // информация в бэк о покупке авто
mp.events.add("client:server:spawnCar", (vehDbId, pay) => { mp.events.callRemote("server:phone:spawnVehicle", vehDbId, pay) });

mp.events.add("client:dealership:setPos", (pos) => { state.positions.dealership = new mp.Vector3(pos.x, pos.y, pos.z) }); // получение xyz из конфига сервера
mp.events.add("client:garage:setPos", (pos) => { state.positions.garage = new mp.Vector3(pos.x, pos.y, pos.z) });
mp.events.add("client:customCar:setPos", (pos) => { state.positions.carCustom = new mp.Vector3(pos.x, pos.y, pos.z) });
mp.events.add('client:fuel:setPos', (pos) => { state.positions.fuel = new mp.Vector3(pos.x, pos.y, pos.z); });
mp.events.add("client:courier:setPos", (pos) => { state.positions.courierStart = new mp.Vector3(pos.x, pos.y, pos.z); });

mp.events.add('client:custom:startTuning', (boxX, boxY, boxZ, boxH) => { // при заезде в LSC - фиксируем авто
    if (!state.isAuthorized || !mp.players.local.vehicle) return;
    const veh = mp.players.local.vehicle;
    veh.position = new mp.Vector3(boxX, boxY, boxZ);
    veh.setHeading(boxH);
    veh.freezePosition(true);
    veh.setCollision(false, false);

    state.isAnyUiWindowOpen = true;
    if (state.uiBrowser) state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('carCustom');`);
    mp.gui.cursor.show(true, true) // включаем курсор
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

mp.events.add('client:courier:target', (x, y, z, stage) => {
    if (state.courierMarker) { state.courierMarker.destroy(); state.courierMarker = null; }
    if (state.courierBlip) { state.courierBlip.destroy(); state.courierBlip = null; }
    state.positions.courierTarget = null;
    if (x === null || x === undefined) return;

    state.positions.courierTarget = new mp.Vector3(x, y, z);
    const isDelivery = stage === 'delivery';
    state.courierMarker = mp.markers.new(1, state.positions.courierTarget, isDelivery ? 1.0 : 2.5, {
        color: isDelivery ? [255, 200, 0, 150] : [100, 150, 255, 150]
    });
    if (isDelivery) {
        state.courierBlip = mp.blips.new(477, state.positions.courierTarget);
        try {
            state.courierBlip.shortRange = false;
            state.courierBlip.name = 'Доставка';
        } catch (e) {}
    }
});

mp.events.addDataHandler("customColor", (entity, value) => { // триггеры тюнинга
    if (mp.vehicles.exists(entity) && value) {
        entity.setCustomPrimaryColour(value.r, value.g, value.b);
        entity.setCustomSecondaryColour(value.r, value.g, value.b)
    }
});

mp.events.addDataHandler("customWheels", (entity, value) => {
    if (mp.vehicles.exists(entity) && value) {
        entity.setWheelType(Number(value.type));
        entity.setMod(23, Number(value.id))
    }
});

mp.events.addDataHandler(/^customMod_(\d+)$/, (entity, value) => {
    if (mp.vehicles.exists(entity) && value !== undefined && value !== null) {
        const modType = Number(entity.activeDataHandlerKey.split('_')[1]);
        entity.setMod(modType, Number(value))
    }
});

mp.events.add("entityStreamIn", (entity) => { // синхронизация стрима
    if (entity.type === "vehicle") {
        const rgb = entity.getVariable("customColor");
        if (rgb) {
            entity.setCustomPrimaryColour(Number(rgb.r), Number(rgb.g), Number(rgb.b));
            entity.setCustomSecondaryColour(Number(rgb.r), Number(rgb.g), Number(rgb.b))
        }

        const wheels = entity.getVariable("customWheels");
        if (wheels && wheels.id !== undefined) {
            entity.setWheelType(Number(wheels.type));
            entity.setMod(23, Number(wheels.id))
        }
        const technicalMods = [11, 12, 13, 18];
        technicalMods.forEach(modType => {
            const modValue = entity.getVariable(`customMod_${modType}`);
            if (modValue !== undefined && modValue !== null && modValue !== -1) entity.setMod(modType, Number(modValue));
        });
    }
});

const botPeds = [];
mp.events.add('client:bot:setup', (pedId, heading) => {
    if (!botPeds.some(b => b.id === pedId)) botPeds.push({ id: pedId, heading });
});

setInterval(() => {
    botPeds.forEach(b => {
        try {
            const ped = mp.peds.atRemoteId(b.id);
            if (!ped || !ped.handle) return;
            if (typeof mp.game.ped.setBlockingOfNonTemporaryEvents === 'function') mp.game.ped.setBlockingOfNonTemporaryEvents(ped.handle, true);
        } catch (e) {}
    });
}, 3000);