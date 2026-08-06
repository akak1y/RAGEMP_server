const tuningService = require('./services/TuningService');
const locationService = require('./services/LocationService');
const { CustomBoxPos } = require('./config');
const logger = require('./logger');


mp.events.add('server:customCar:requestPos', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:customCar:setPos', [locationService.getPosition('lsc')])
});

mp.events.add('server:custom:buyUpgrade', async (player, categoryKey, optionJson, price) => { // покупка тюнинга
    try {
        if (!player.isLoggedIn) return;

        let option;
        try { option = JSON.parse(optionJson) }
        catch { return }

        const veh = player.vehicle;
        if (!veh || !veh.vehicleDbId) return;

        const result = await tuningService.buyUpgrade(player, veh, categoryKey, option, price);

        if (!result.success && result.error === 'not_enough_money') player.outputChatBox("!{#FF3333}[LSC] Недостаточно средств для покупки этой модификации");
    } catch (err) { logger.error(`Ошибка при покупке тюнинга: ${err.message}`) }
});

mp.events.add('server:custom:exitShop', (player) => { // выход из LSC
    if (!player.isLoggedIn) return;
    tuningService.exitTuning(player)
});

mp.events.add('server:customCar:enterTuning', async (player) => { // вход в LSC
    if (!player.isLoggedIn || !player.vehicle) return;

    const result = await tuningService.enterTuning(player);
    if (!result.success) return;

    player.call('client:custom:startTuning', [CustomBoxPos.x, CustomBoxPos.y, CustomBoxPos.z, CustomBoxPos.h]); // отправляем триггер для фиксации авто
})