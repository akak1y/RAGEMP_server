const Vehicle = require('./models/Vehicle');
const { VehicleConfig, DealershipPos, PhoneConfig, GaragePos } = require('./config');

mp.blips.new(225, DealershipPos, { name: "Автосалон", color: 2, scale: 1.0, shortRange: true }); // иконка на карте
mp.markers.new(1, new mp.Vector3(DealershipPos.x, DealershipPos.y, DealershipPos.z - 1.0), 1.5, { color: [0, 200, 0, 150]}); // чекпоинт

if (!global.spawnedVehicles) { global.spawnedVehicles = new Map() }
if (!global.playerOwnedVehicles) { global.playerOwnedVehicles = new Map() }

mp.events.add('server:dealership:buy', async (player, model) => {
    if (!player.isLoggedIn || !VehicleConfig[model]) return;
    const config = VehicleConfig[model];

    if (player.money < config.price) return player.outputChatBox("!{#FF3333}[Ошибка] Недостаточно денег."); // проверка баланса

    const hasPaid = await player.takeMoney(config.price); // если хватает денег - списываем с баланса
    if (!hasPaid) return;

    await Vehicle.create({ owner_id: player.accountId, model: model }); // создаём запись в бд
    player.outputChatBox(`!{#33FF33}[Успех] Вы купили ${config.name}!`);
    player.call('client:phone:updateCars') // обновляем телефон
});

mp.events.add('server:phone:requestCars', async (player) => { // при открытии телефона
    if (!player.isLoggedIn) return;
    try {
        const cars = await Vehicle.findAll({ where: { owner_id: player.accountId } }); // вытаскиваем все машины player
        player.call('client:phone:setCarList', [ // отправляем данные в телефон
            JSON.stringify(cars), 
            JSON.stringify(VehicleConfig)
        ]);
    } catch (err) { console.error("[Phone Error] Не удалось получить гараж:", err) }
});

mp.events.add('server:phone:spawnVehicle', async (player, vehicleDbId, fromPhone) => { // доставка авто
    if (!player.isLoggedIn || !vehicleDbId) return;

    const hasPhone = player.inventory.some(slot => slot && slot.itemId === 'phone'); // проверка наличия телефона в инвентаре
    if (!hasPhone) return player.outputChatBox("!{#FF3333}[Ошибка] У вас нет телефона!");

    try {
        const carData = await Vehicle.findOne({
            where: { id: vehicleDbId, owner_id: player.accountId } // находим авто бд с условием владельца
        });
        if (!carData) return;
        const config = VehicleConfig[carData.model];
        if (global.spawnedVehicles.has(vehicleDbId)) {
            const oldVeh = global.spawnedVehicles.get(vehicleDbId); // находим авто которое игрок уже заспавнил
            if (mp.vehicles.exists(oldVeh)) return player.outputChatBox(`!{#FF1111}[Телефон] Машина ${config.name} уже заспавнена.`)
        }
        if (fromPhone) {
            const payment = await player.takeMoney(PhoneConfig.deliveryCar); // если платно - списываем деньги
            if (!payment) return player.outputChatBox("!{#FF3333}[Ошибка] У вас недостаточно денег!")
        }
        
        const posCar = new Object();;
        if (!fromPhone) {
            posCar.coords = new mp.Vector3(GaragePos.x, GaragePos.y, GaragePos.z); // спавним на метке гаража
            posCar.heading = GaragePos.h;
            posCar.inside = true
        } else {
            posCar.coords = new mp.Vector3(player.position.x + 2, player.position.y, player.position.z); // спавним в x+2 от игрока
            posCar.heading = player.heading;
            posCar.inside = false
        }
        const veh = mp.vehicles.new(mp.joaat(carData.model), posCar.coords, { // вызываем хэш авто
            heading: posCar.heading, engine: true, locked: false, dimension: player.dimension
        });
        veh.vehicleDbId = vehicleDbId;
        veh.setVariable("customColor", {
            r: carData.color_r,
            g: carData.color_g,
            b: carData.color_b
        });
        veh.setVariable("customMod_11", carData.engine_mod !== null ? carData.engine_mod : -1);
        veh.setVariable("customMod_12", carData.brakes_mod !== null ? carData.brakes_mod : -1);
        veh.setVariable("customMod_13", carData.transmission_mod !== null ? carData.transmission_mod : -1);
        veh.setVariable("customMod_18", carData.turbo_mod !== null ? carData.turbo_mod : -1);
        veh.setVariable("customWheels", {
            type: carData.wheel_type !== null ? carData.wheel_type : 0,
            id: carData.wheel_mod !== null ? carData.wheel_mod : -1
        });
        if (posCar.inside) {
            setTimeout(() => {
                if (mp.players.exists(player) && mp.vehicles.exists(veh)) { player.putIntoVehicle(veh, 0) } // садим игрока за руль с задержкой
            }, 150)
        }
        global.spawnedVehicles.set(vehicleDbId, veh); // записываем в ОЗУ

        let playerCars = global.playerOwnedVehicles.get(player.accountId);
        if (!playerCars) {
            playerCars = new Set();
            global.playerOwnedVehicles.set(player.accountId, playerCars); // добавляем овнера авто в карту
        }
        playerCars.add(vehicleDbId);
        player.outputChatBox(`!{#00FFFF}[Телефон] Ваша машина ${config.name} доставлена.`)
    } catch (err) { console.error(err) }
});

mp.events.add('server:dealership:requestConfig', (player) => { // отправка конфига в vue
    if (!player.isLoggedIn) return;
    player.call('client:dealership:setConfig', [JSON.stringify(VehicleConfig)])
});

mp.events.add('server:dealership:requestPos', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:dealership:setPos', [DealershipPos])
});

mp.events.add('server:phone:requestPriceDeliveryCar', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:phone:requestPriceDeliveryCar', [PhoneConfig.deliveryCar])
})