const vehicleService = require('../services/VehicleService');
const inventoryService = require('../services/InventoryService');
const locationService = require('../services/LocationService');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const { VehicleConfig, PhoneConfig, GaragePos, FuelStationPos, FuelPricePerLiter, FuelInteractionRadius } = require('../config');
const auditService = require('../services/AuditService');

mp.events.add('server:dealership:buy', withGuards([isLoggedIn], async (player, model) => {
    if (!VehicleConfig[model]) return;
    const config = VehicleConfig[model];

    if (player.money < config.price) return player.outputChatBox("!{#FF3333}[Ошибка] Недостаточно денег."); // проверка баланса

    const result = await vehicleService.buyVehicle(player.accountId, model);
    if (!result.success) return;
    player.applyMoneyDelta(-config.price);

    player.outputChatBox(`!{#33FF33}[Успех] Вы купили ${config.name}!`);
    player.call('client:phone:updateCars') // обновляем телефон
}, 'dealership:buy'));

mp.events.add('server:phone:requestCars', withGuards([isLoggedIn], async (player) => { // при открытии телефона
    const cars = await vehicleService.getPlayerVehicles(player.accountId);
    player.call('client:phone:setCarList', [ // отправляем данные в телефон
        JSON.stringify(cars), 
        JSON.stringify(VehicleConfig)
    ]);
}, 'phone:requestCars'));

mp.events.add('server:phone:spawnVehicle', withGuards([isLoggedIn], async (player, vehicleDbId, fromPhone) => { // доставка авто
    if (!vehicleDbId) return;

    const hasPhone = inventoryService.hasItem(player, 'phone');
    if (!hasPhone) return player.outputChatBox("!{#FF3333}[Ошибка] У вас нет телефона!");

    const carData = await vehicleService.getVehicleForOwner(vehicleDbId, player.accountId);
    if (!carData) return;
    const config = VehicleConfig[carData.model];
    if (vehicleService.isSpawned(vehicleDbId)) {
        return player.outputChatBox(`!{#FF1111}[Телефон] Машина ${config.name} уже заспавнена.`)
    }
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
}, 'phone:spawnVehicle'));

mp.events.add('server:dealership:requestConfig', withGuards([isLoggedIn], (player) => { // отправка конфига в vue
    player.call('client:dealership:setConfig', [JSON.stringify(VehicleConfig)])
}, 'dealership:requestConfig'));

mp.events.add('server:dealership:requestPos', withGuards([isLoggedIn], (player) => {
    player.call('client:dealership:setPos', [locationService.getPosition('dealership')])
}, 'dealership:requestPos'));

mp.events.add('server:phone:requestPriceDeliveryCar', withGuards([isLoggedIn], (player) => {
    player.call('client:phone:requestPriceDeliveryCar', [PhoneConfig.deliveryCar])
}, 'phone:requestPriceDeliveryCar'));

mp.events.add('server:garage:requestPos', withGuards([isLoggedIn], (player) => {
    player.call('client:garage:setPos', [locationService.getPosition('garage')])
}, 'garage:requestPos'));

mp.events.add('server:fuel:requestPos', withGuards([isLoggedIn], (player) => {
    player.call('client:fuel:setPos', [locationService.getPosition('fuel')]);
}, 'fuel:requestPos'));

mp.events.add('server:fuel:refuel', withGuards([isLoggedIn], async (player, vehicleDbId) => {
    if (!vehicleDbId) return;

    const veh = vehicleService.spawnedVehicles.get(vehicleDbId);
    if (!veh || !mp.vehicles.exists(veh)) return player.outputChatBox('!{#FF3333}[Заправка] Машина не рядом.');
    if (player.dist(veh.position) > FuelInteractionRadius) return player.outputChatBox('!{#FF3333}[Заправка] Подойдите ближе к машине.');

    const own = await vehicleService.getVehicleForOwner(vehicleDbId, player.accountId);
    if (!own) return player.outputChatBox('!{#FF3333}[Заправка] Это не ваша машина.');

    const currentFuel = Number(veh.getVariable('fuel') || 0);
    const liters = 100 - currentFuel;
    if (liters <= 0.1) return player.outputChatBox('!{#00FFFF}[Заправка] Бак уже полон.');

    const cost = Math.ceil(liters * FuelPricePerLiter);
    const payment = await player.takeMoney(cost, 'заправка');
    if (!payment) return player.outputChatBox('!{#FF3333}[Заправка] Недостаточно денег!');

    await vehicleService.refuelVehicle(vehicleDbId, player.accountId);
    player.outputChatBox(`!{#00FF00}[Заправка] Залито ${liters.toFixed(1)} л за $${cost}`);
    auditService.logPlayer(player, 'fuel', {
        category: 'money', amount: cost,
        details: { liters: Number(liters.toFixed(1)) }
    })
}, 'fuel:refuel'))