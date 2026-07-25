const { GaragePos } = require('./config');

mp.blips.new(357, GaragePos, { name: "Гараж", color: 74, scale: 1.0, shortRange: true }); // иконка на карте
mp.markers.new(36, new mp.Vector3(GaragePos.x, GaragePos.y, GaragePos.z - 1.0), 2.0, { color: [150, 150, 255, 150]}); // чекпоинт

mp.events.add('server:garage:requestPos', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:garage:setPos', [GaragePos])
})