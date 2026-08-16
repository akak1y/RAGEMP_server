require('./state'); // создаём UIstate
const state = globalThis.UIState;
require('./auth');
require('./windows');
require('./speedometer');
require('./courier');
require('./bots');
require('./tuning');
require('./vehicleSync');
require('./interactions');
require('./keys');

mp.gui.chat.show(false); // скрываем чат и миникарту
mp.game.ui.displayRadar(false);

mp.events.add("playerReady", () => { state.uiBrowser = mp.browsers.new("http://localhost:5173/") }); // подключаемся к vue сайту



mp.events.add("browserCreated", (browser) => { // когда создался браузер
    if (state.uiBrowser && browser === state.uiBrowser){
        mp.gui.cursor.show(true, true) // включаем курсор для авторизации
    }
});

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