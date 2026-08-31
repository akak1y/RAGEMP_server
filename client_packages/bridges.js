require('./ui');

const state = globalThis.UIState;
const ui = globalThis.ui;

/**
 * Мосты между игрой и Vue.
 */

// ДАННЫЕ → VUE ==============
mp.events.add('client:ui:debugLog', (msg, type = 'info') => {
    ui.call('addDebugLog', msg, type);
});

mp.events.add('client:updateMoney', (money) => {
    ui.call('updateMoney', money);
});

mp.events.add('client:inventory:update', (jsonSlots, jsonConfig) => {
    ui.call('updateInventory', JSON.parse(jsonSlots), JSON.parse(jsonConfig));
});

mp.events.add('client:phone:setCarList', (carsJson, configJson) => {
    ui.call('setPhoneCars', JSON.parse(carsJson), JSON.parse(configJson));
});

mp.events.add('client:setRedisStats', (count) => {
    ui.call('updateGlobalStats', count);
});

mp.events.add('client:dealership:setConfig', (carsJson) => {
    ui.call('setDealershipCars', JSON.parse(carsJson));
});

mp.events.add('client:phone:requestPriceDeliveryCar', (price) => {
    ui.call('setPriceDeliveryCar', price);
});

mp.events.add('client:customCar:setTuningConfig', (json) => {
    ui.call('setTuningConfig', JSON.parse(json));
});

mp.events.add('client:customCar:setTuningState', (json) => {
    ui.call('setTuningState', JSON.parse(json));
});

// VUE → СЕРВЕР ==============
mp.events.add('client:phone:updateCars', () => {
    mp.events.callRemote('server:phone:requestCars');
});
mp.events.add('client:ui:requestStatsUpdate', () => {
    mp.events.callRemote('server:requestRedisStats');
});
mp.events.add('client:toggleCursor', (toggle) => {
    mp.gui.cursor.show(toggle, toggle);
});
mp.events.add('client:server:buyCar', (model) => {
    mp.events.callRemote('server:dealership:buy', model);
});
mp.events.add('client:server:spawnCar', (vehDbId, pay) => {
    mp.events.callRemote('server:phone:spawnVehicle', vehDbId, pay);
});

// КООРДИНАТЫ ЛОКАЦИЙ ==============
mp.events.add('client:dealership:setPos', (pos) => {
    state.positions.dealership = new mp.Vector3(pos.x, pos.y, pos.z);
});
mp.events.add('client:garage:setPos', (pos) => {
    state.positions.garage = new mp.Vector3(pos.x, pos.y, pos.z);
});
mp.events.add('client:customCar:setPos', (pos) => {
    state.positions.carCustom = new mp.Vector3(pos.x, pos.y, pos.z);
});
mp.events.add('client:fuel:setPos', (pos) => {
    state.positions.fuel = new mp.Vector3(pos.x, pos.y, pos.z);
});
mp.events.add('client:courier:setPos', (pos) => {
    state.positions.courierStart = new mp.Vector3(pos.x, pos.y, pos.z);
});
