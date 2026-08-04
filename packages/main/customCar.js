const { CarCustomPos, CustomBoxPos } = require('./config');
const Vehicle = require('./models/Vehicle');
const logger = require('./logger');

mp.blips.new(402, CarCustomPos, { name: "LSC", color: 1, scale: 1.0, shortRange: true }); // иконка на карте
mp.markers.new(44, new mp.Vector3(CarCustomPos.x, CarCustomPos.y, CarCustomPos.z - 1.0), 2.0, { color: [255, 100, 100, 150]}); // чекпоинт

mp.events.add('server:customCar:requestPos', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:customCar:setPos', [CarCustomPos])
});

const tuningVehicles = new Map(); // карта для отслеживания машин, которые сейчас находятся в тюнинге

mp.events.add('server:custom:buyUpgrade', async (player, categoryKey, optionJson, price) => { // покупка тюнинга
    try {
        if (!player.isLoggedIn) return;

        const option = JSON.parse(optionJson);
        const veh = player.vehicle;
        if (!veh) return;

        const hasMoney = await player.takeMoney(price); // проверка и списание денег
        if (!hasMoney) return player.call('client:showAuthError', ['Недостаточно средств для покупки этой модификации']);

        if (categoryKey === 'color' && veh.vehicleDbId) { // если покраска -> сохраняем в бд
            await Vehicle.update({
                color_r: option.r,
                color_g: option.g,
                color_b: option.b
            }, {
                where: { id: veh.vehicleDbId }
            })
        }
        if (categoryKey === 'performance' && veh.vehicleDbId) {
    
            const modFields = {
                11: 'engine_mod',
                12: 'brakes_mod',
                13: 'transmission_mod',
                18: 'turbo_mod'
            };
            const dbField = modFields[option.type];
            if (dbField) {
                await Vehicle.update(
                    { [dbField]: option.id }, 
                    { where: { id: veh.vehicleDbId } }
                );
                veh.setVariable(`customMod_${option.type}`, option.id)
            }
        }

        if (categoryKey === 'wheels' && veh.vehicleDbId) {
            await Vehicle.update({ 
                wheel_type: option.type, 
                wheel_mod: option.id 
            }, { 
                where: { id: veh.vehicleDbId } 
            });
            veh.setVariable("customWheels", { type: option.type, id: option.id })
        }
    } catch (err) { logger.error(`Ошибка при покупке тюнинга: ${err.message}`) }
});

mp.events.add('server:custom:exitShop', (player) => { // выход из LSC
    if (!player.isLoggedIn) return;

    const veh = tuningVehicles.get(player.accountId); // ищем авто в карте тюнинга
    
    if (veh && mp.vehicles.exists(veh)) { // устанавливаем новую позицию авто
        veh.position = new mp.Vector3(CarCustomPos.x, CarCustomPos.y, CarCustomPos.z);
        veh.rotation = new mp.Vector3(0.0, 0.0, CarCustomPos.h);
        veh.dimension = 0;
    }
    tuningVehicles.delete(player.accountId);
    player.dimension = 0
});

mp.events.add('server:customCar:enterTuning', (player) => { // вход в LSC
    if (player.isLoggedIn && player.vehicle) { // проверяем на колёсах он или пешком
        if (!player.isLoggedIn || !player.vehicle) return;
        const veh = player.vehicle;
        tuningVehicles.set(player.accountId, veh); // записываем в карту

        player.dimension = player.id; // переносим в другое измерение
        veh.dimension = player.id;
        player.call('client:custom:startTuning', [CustomBoxPos.x, CustomBoxPos.y, CustomBoxPos.z, CustomBoxPos.h]); // отправляем триггер для фиксации авто
    }
})