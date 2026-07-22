const Vehicle = require('./models/Vehicle');
const { VehicleConfig, DealershipPos } = require('./config');

mp.blips.new(225, DealershipPos, { name: "Автосалон", color: 2, scale: 1.0, shortRange: true }); // иконка на карте
mp.markers.new(1, new mp.Vector3(DealershipPos.x, DealershipPos.y, DealershipPos.z - 1.0), 1.5, { color: [0, 200, 0, 150]}); // чекпоинт

const spawnedVehicles = new Map();

mp.events.add('server:dealership:buy', async (player, model) => {
    if (!player.isLoggedIn || !VehicleConfig[model]) return;
    const config = VehicleConfig[model];

    if (player.money < config.price) { // проверка баланса
        player.outputChatBox("!{#FF3333}[Ошибка] Недостаточно денег.");
        return
    }

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

mp.events.add('server:phone:spawnVehicle', async (player, vehicleDbId) => { // доставка авто
    if (!player.isLoggedIn || !vehicleDbId) return;

    const hasPhone = player.inventory.some(slot => slot && slot.itemId === 'phone'); // проверка наличия телефона в инвентаре
    if (!hasPhone) {
        player.outputChatBox("!{#FF3333}[Ошибка] У вас нет телефона!");
        return
    }

    try {
        const carData = await Vehicle.findOne({
            where: { id: vehicleDbId, owner_id: player.accountId } // находим авто бд с условием владельца
        });
        if (!carData) return;

        if (spawnedVehicles.has(player.accountId)) {
            const oldVeh = spawnedVehicles.get(player.accountId); // находим авто которое игрок уже заспавнил
            if (mp.vehicles.exists(oldVeh)) oldVeh.destroy(); // если она в мире -> уничтожаем
        }

        const veh = mp.vehicles.new(mp.joaat(carData.model), new mp.Vector3(player.position.x + 2, player.position.y, player.position.z), { // вызываем хэш  авто и спавним в x+2 от игрока
            heading: player.heading, engine: true, locked: false
        });
        spawnedVehicles.set(player.accountId, veh); // записываем в ОЗУ
        player.outputChatBox(`!{#00FFFF}[Телефон] Ваша машина ${carData.model} доставлена.`)
    } catch (err) { console.error(err) }
});

mp.events.add('server:dealership:requestConfig', (player) => { // отправка конфига в vue
    if (!player.isLoggedIn) return;
    player.call('client:dealership:setConfig', [JSON.stringify(VehicleConfig)]);
})