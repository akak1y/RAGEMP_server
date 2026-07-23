let uiBrowser = null;
let isAuthorized = false;
let globalKeyBlock = false; // предохранитель для чата
let openWindowsState = { // состояние интерфесов
    inventory: false,
    phone: false,
    dealership: false
};
let isAnyUiWindowOpen = false; // для заморозки игрока если открыто любое окно
let dealershipPos = null;

mp.gui.chat.show(false); // скрываем чат и миникарту
mp.game.ui.displayRadar(false);

mp.events.add("playerReady", () => { uiBrowser = mp.browsers.new("http://localhost:5173/") }); // подключаемся к vue сайту

mp.keys.bind(0x54, false, () => { // срабатывает на отпускание T
    if (!isAuthorized || isAnyUiWindowOpen) return;
    globalKeyBlock = true // закрываем доступ к окнам
});
mp.keys.bind(0x0D, true, () => { // enter
    if (!isAuthorized) return;
    setTimeout(() => { globalKeyBlock = false }, 60)
});
mp.keys.bind(0x1B, true, () => { // escape
    if (!isAuthorized) return;
    setTimeout(() => { globalKeyBlock = false }, 60)
});

mp.events.add("browserCreated", (browser) => { // когда создался браузер
    if (uiBrowser && browser === uiBrowser){
        mp.gui.cursor.show(true, true) // включаем курсор для авторизации
    }
});

mp.events.add("client:account:submitLogin", (username, password) => { // кнопка войти
    mp.events.callRemote("server:account:login", username, password) // пересылаем на сервер для проверки
});

mp.events.add("client:account:authError", (msg) => { // ошибка авторизации
    if (uiBrowser) uiBrowser.execute(`window.showAuthError("${msg}");`); 
});

mp.events.add("client:account:hideAuth", () => { // успешная авторизация
    mp.gui.cursor.show(false, false); // сбрасываем все блокировки при спавне
    mp.gui.chat.show(true);
    mp.game.ui.displayRadar(true);
    isAuthorized = true;
    globalKeyBlock = false;
    isAnyUiWindowOpen = false;
    openWindowsState = { inventory: false, phone: false, dealership: false };
    mp.events.callRemote("server:dealership:requestPos");
    if (uiBrowser) uiBrowser.execute(`window.changeScreen("game");`) // меняем окно авторизации на игровой худ
});

mp.events.add("client:ui:windowStateChanged", (winName, isOpen) => { // выключаем/включаем чат при открытии/закрытии любого окна
    if (openWindowsState.hasOwnProperty(winName)) { openWindowsState[winName] = isOpen }
    isAnyUiWindowOpen = Object.values(openWindowsState).some(state => state === true);

    if (isAnyUiWindowOpen) { mp.gui.chat.activate(false) }
    else { mp.gui.chat.activate(true) }
});

mp.events.add("render", () => { // при открытом любом окне отключаем движение персонажа
    if (isAuthorized && isAnyUiWindowOpen) {
        mp.game.controls.disableControlAction(0, 30, true); // A/D
        mp.game.controls.disableControlAction(0, 31, true); // W/S
        mp.game.controls.disableControlAction(0, 21, true); // shift
        mp.game.controls.disableControlAction(0, 22, true); // space
        mp.game.controls.disableControlAction(0, 1, true);  // мышь X
        mp.game.controls.disableControlAction(0, 2, true);  // мышь Y
        mp.game.controls.disableControlAction(0, 24, true) // лкм
    }
});

mp.keys.bind(0x49, true, () => { // I - инвентарь
    if (!isAuthorized || globalKeyBlock) return;
    if (!openWindowsState.inventory && isAnyUiWindowOpen) return;
    if (uiBrowser) uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('inventory');`)
});

mp.keys.bind(0x50, true, () => { // P - телефон
    if (!isAuthorized || globalKeyBlock) return;
    if (!openWindowsState.phone && isAnyUiWindowOpen) return;
    mp.events.callRemote("server:phone:requestCars"); // запрашиваем список авто
    if (uiBrowser) uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('phone');`)
});

mp.keys.bind(0x45, true, () => { // E - маркер автосалона
    if (!isAuthorized || globalKeyBlock || isAnyUiWindowOpen) return;
    const distance = mp.game.gameplay.getDistanceBetweenCoords( mp.players.local.position.x, mp.players.local.position.y, mp.players.local.position.z, dealershipPos.x, dealershipPos.y, dealershipPos.z, true ); // вычисляем дистанцию до маркера в 3D
    
    if (distance <= 2.5 && uiBrowser) {
        mp.events.callRemote("server:dealership:requestConfig");
        uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('dealership');`)
    }
});

// мосты для vue
mp.events.add("client:updateMoney", (money) => {
    if (uiBrowser) {
        uiBrowser.execute(`if(window.updateMoney) window.updateMoney(${money});`)
    }
});

mp.events.add("client:inventory:update", (jsonSlots, jsonConfig) => {
    if (uiBrowser) {
        uiBrowser.execute(`if(window.updateInventory) window.updateInventory('${jsonSlots}', '${jsonConfig}');`)
    }
});

mp.events.add("client:phone:setCarList", (carsJson, configJson) => {
    if (uiBrowser) {
        uiBrowser.execute(`if(window.setPhoneCars) window.setPhoneCars('${carsJson}', '${configJson}');`)
    }
});

mp.events.add("client:setRedisStats", (count) => {
    if (uiBrowser) {
        uiBrowser.execute(`if(window.updateGlobalStats) window.updateGlobalStats(${count});`)
    }
});

mp.events.add("client:dealership:setConfig", (carsJson) => {
    if (uiBrowser) {
        uiBrowser.execute(`if(window.setDealershipCars) window.setDealershipCars('${carsJson}');`)
    }
});

mp.events.add("client:phone:updateCars", () => { mp.events.callRemote("server:phone:requestCars") });
mp.events.add("client:ui:requestStatsUpdate", () => { mp.events.callRemote("server:requestRedisStats") });
mp.events.add("client:toggleCursor", (toggle) => { mp.gui.cursor.show(toggle, toggle) });
mp.events.add("client:server:buyCar", (model) => { mp.events.callRemote("server:dealership:buy", model) }); // информация в бэк о покупке авто
mp.events.add("client:server:spawnCar", (vehDbId) => { mp.events.callRemote("server:phone:spawnVehicle", vehDbId) }); // о спавне
mp.events.add("client:dealership:setPos", (pos) => { dealershipPos = pos }); // получение xyz из конфига сервера