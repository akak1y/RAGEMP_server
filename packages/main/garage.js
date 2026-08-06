const locationService = require('./services/LocationService');

mp.events.add('server:garage:requestPos', (player) => {
    if (!player.isLoggedIn) return;
    player.call('client:garage:setPos', [locationService.getPosition('garage')])
})