require('./ui');
require('./natives');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;

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
    natives.showCursor(toggle);
});
mp.events.add('client:server:buyCar', (model) => {
    mp.events.callRemote('server:dealership:buy', model);
});
mp.events.add('client:server:spawnCar', (vehDbId, pay) => {
    mp.events.callRemote('server:phone:spawnVehicle', vehDbId, pay);
});

mp.events.add('client:locations:setAll', (json) => {
    try {
        const data = JSON.parse(json);
        if (data.dealership)
            state.positions.dealership = new mp.Vector3(
                data.dealership.x,
                data.dealership.y,
                data.dealership.z
            );
        if (data.garage)
            state.positions.garage = new mp.Vector3(data.garage.x, data.garage.y, data.garage.z);
        if (data.carCustom)
            state.positions.carCustom = new mp.Vector3(
                data.carCustom.x,
                data.carCustom.y,
                data.carCustom.z
            );
        if (data.fuel) state.positions.fuel = new mp.Vector3(data.fuel.x, data.fuel.y, data.fuel.z);
        if (data.courierStart)
            state.positions.courierStart = new mp.Vector3(
                data.courierStart.x,
                data.courierStart.y,
                data.courierStart.z
            );
        if (data.shop) state.positions.shop = new mp.Vector3(data.shop.x, data.shop.y, data.shop.z);

        if (data.mining) {
            state.positions.miningRocks = (data.mining.rocks || []).map(
                (r) => new mp.Vector3(r.x, r.y, r.z)
            );
            state.positions.bot = new mp.Vector3(
                data.mining.botPos.x,
                data.mining.botPos.y,
                data.mining.botPos.z
            );
            state.miningRocksActive =
                data.mining.active || (data.mining.rocks || []).map(() => true);
        }

        if (data.phonePrice !== undefined) {
            ui.call('setPriceDeliveryCar', data.phonePrice);
        }
        if (data.mafiaBase)
            state.positions.mafiaBase = new mp.Vector3(
                data.mafiaBase.x,
                data.mafiaBase.y,
                data.mafiaBase.z
            );
        if (data.hospital) {
            state.positions.hospital = new mp.Vector3(
                data.hospital.x,
                data.hospital.y,
                data.hospital.z
            );
        }
    } catch (e) {}
});
