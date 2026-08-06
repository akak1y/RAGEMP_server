const vehicleService = require('./services/VehicleService');
const inventoryService = require('./services/InventoryService');
const locationService = require('./services/LocationService');
const { VehicleConfig, PhoneConfig, GaragePos } = require('./config');

mp.events.add('server:dealership:buy', async (player, model) => {
    if (!player.isLoggedIn || !VehicleConfig[model]) return;
    const config = VehicleConfig[model];

    if (player.money < config.price) return player.outputChatBox("!{#FF3333}[Ошибка] Недостаточно денег."); // проверка баланса

    const result = await vehicleService.buyVehicle(player.accountId, model);
    if (!result.success) return;
    player.applyMoneyDelta(-config.price);
    player.outputChatBox(`!{#33FF33}[Успех] Вы купили ${config.name}!`);
    player.call('client:phone:updateCars') // обновляем телефон
});

mp.events.add('server:phone:requestCars', async (player) => { // при открытии телефона
    if (!player.isLoggedIn) return;
    try {
        const cars = await vehicleService.getPlayerVehicles(player.accountId);
        player.call('client:phone:setCarList', [ // отправляем данные в телефон
            JSON.stringify(cars), 
            JSON.stringify(VehicleConfig)
        ]);
    } catch (err) { console.error("[Phone Error] Не удалось получить гараж:", err) }
});

mp.events.add('server:phone:spawnVehicle', async (player, vehicleDbId, fromPhone) => { // доставка авто
    if (!player.isLoggedIn || !vehicleDbId) return;

    const hasPhone = inventoryService.hasItem(player, 'phone');
    if (!hasPhone) return player.outputChatBox("!{#FF3333}[Ошибка] У вас нет телефона!");

    try {
        const carData = await vehicleService.getVehicleForOwner(vehicleDbId, player.accountId);
        if (!carData) return;
        const config = VehicleConfig[carData.model];
        if (vehicleService.isSpawned(vehicleDbId)) return player.outputChatBox(`!{#FF1111}[Телефон] Машина ${config.name} уже заспавнена.`);

        if (fromPhone) {
            const payment = await player.takeMoney(PhoneConfig.deliveryCar, 'доставка авто'); // если платно - списываем деньги
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
        
        const veh = vehicleService.spawnVehicle(carData, posCar.coords, posCar.heading, player.dimension);
        if (posCar.inside) {
            setTimeout(() => {
                if (mp.players.exists(player) && mp.vehicles.exists(veh)) { player.putIntoVehicle(veh, 0) } // садим игрока за руль с задержкой
            }, 150)
        }
        player.outputChatBox(`!{#00FFFF}[Телефон] Ваша машина ${config.name} доставлена.`)
    } catch (err) { console.error(err) }
});

mp.events.add('server:dealership:requestConfig', (player) => { // отправка конфига в vue
    if (!player.isLoggedIn) return;
    player.call('client:dealership:setConfig', [JSON.stringify(VehicleConfig)])
});

mp.events.add('server:dealership:requestPos', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:dealership:setPos', [locationService.getPosition('dealership')])
});

mp.events.add('server:phone:requestPriceDeliveryCar', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:phone:requestPriceDeliveryCar', [PhoneConfig.deliveryCar])
})