const tuningService = require('../services/TuningService');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const rateLimit = require('../middleware/rateLimit');
const { CustomBoxPos, TuningConfig } = require('../config');

/**
 * Тюнинг транспорта: вход в LCS, покупка тюнинга, выход.
 */

mp.events.add('server:customCar:enterTuning', withGuards([isLoggedIn, rateLimit('enter_tuning', 1, 5)], async (player) => { // вход в LSC
    if (!player.vehicle) return;

    const result = await tuningService.enterTuning(player);
    if (!result.success) return;

    player.call('client:customCar:setTuningConfig', [JSON.stringify(TuningConfig)]); // каталог клиенту
    player.call('client:customCar:setTuningState', [JSON.stringify(tuningService.getTuningState(result.carData))]); // состояние клиенту
    player.call('client:custom:startTuning', [CustomBoxPos.x, CustomBoxPos.y, CustomBoxPos.z, CustomBoxPos.h]); // триггер фиксации авто
}, 'customCar:enterTuning'));

mp.events.add('server:custom:buyUpgrade', withGuards([isLoggedIn, rateLimit('buy_upgrade', 1, 5)], async (player, categoryKey, optionJson, price) => { // покупка тюнинга
    let option;
    try { option = JSON.parse(optionJson) }
    catch { return }

    const veh = player.vehicle;
    if (!veh || !veh.vehicleDbId) return;

    const { getSequelize } = require('../core/db');
    const sequelize = getSequelize();

    let realPrice = null;
    try {
        await sequelize.transaction(async (t) => {
            const result = await tuningService.buyUpgrade(player, veh, categoryKey, option, price, t);
            if (!result.success) {
                if (result.error === 'not_enough_money') throw new Error('not_enough_money');
                if (result.error === 'already_installed') throw new Error('already_installed');
                throw new Error(result.error);
            }
            realPrice = result.realPrice;
        });
    } catch (err) {
        if (err.message === 'not_enough_money') return player.outputChatBox("!{#FF3333}[LSC] Недостаточно средств для покупки этой модификации");
        if (err.message === 'already_installed') return player.outputChatBox("!{#FFaa00}[LSC] Эта модификация уже установлена на автомобиле");
        return;
    }
    player.applyMoneyDelta(-realPrice);
    const freshCar = await require('../services/VehicleService').getVehicleForOwner(veh.vehicleDbId, player.accountId);
    if (freshCar) player.call('client:customCar:setTuningState', [JSON.stringify(tuningService.getTuningState(freshCar))]);
}, 'custom:buyUpgrade'));

mp.events.add('server:custom:exitShop', withGuards([isLoggedIn], (player) => { // выход из LSC
    tuningService.exitTuning(player);
}, 'custom:exitShop'))