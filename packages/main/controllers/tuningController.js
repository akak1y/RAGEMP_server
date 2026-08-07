const tuningService = require('../services/TuningService');
const locationService = require('../services/LocationService');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const { CustomBoxPos, TuningConfig } = require('../config');

mp.events.add('server:customCar:requestPos', withGuards([isLoggedIn], (player) => {
    player.call('client:customCar:setPos', [locationService.getPosition('lsc')])
}, 'customCar:requestPos'));

mp.events.add('server:custom:buyUpgrade', withGuards([isLoggedIn], async (player, categoryKey, optionJson, price) => { // покупка тюнинга
    let option;
    try { option = JSON.parse(optionJson) }
    catch { return }

    const veh = player.vehicle;
    if (!veh || !veh.vehicleDbId) return;

    const result = await tuningService.buyUpgrade(player, veh, categoryKey, option, price);

    if (!result.success && result.error === 'not_enough_money') player.outputChatBox("!{#FF3333}[LSC] Недостаточно средств для покупки этой модификации");
    if (!result.success && result.error === 'already_installed') player.outputChatBox("!{#FFaa00}[LSC] Эта модификация уже установлена на автомобиле");

    if (result.success) {
        const freshCar = await require('../services/VehicleService').getVehicleForOwner(veh.vehicleDbId, player.accountId);
        if (freshCar) player.call('client:customCar:setTuningState', [JSON.stringify(tuningService.getTuningState(freshCar))]);
    }
}, 'custom:buyUpgrade'));

mp.events.add('server:custom:exitShop', withGuards([isLoggedIn], (player) => { // выход из LSC
    tuningService.exitTuning(player);
}, 'custom:exitShop'));

mp.events.add('server:customCar:enterTuning', withGuards([isLoggedIn], async (player) => { // вход в LSC
    if (!player.vehicle) return;

    const result = await tuningService.enterTuning(player);
    if (!result.success) return;

    player.call('client:customCar:setTuningConfig', [JSON.stringify(TuningConfig)]); // каталог клиенту
    player.call('client:customCar:setTuningState', [JSON.stringify(tuningService.getTuningState(result.carData))]); // состояние клиенту
    player.call('client:custom:startTuning', [CustomBoxPos.x, CustomBoxPos.y, CustomBoxPos.z, CustomBoxPos.h]); // триггер фиксации авто
}, 'customCar:enterTuning'));