const locationService = require('../services/LocationService');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');

/**
 * Раздача координат игровых локаций клиентам (маркеры/blips).
 */

mp.events.add(
    'server:dealership:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:dealership:setPos', [locationService.getPosition('dealership')]);
        },
        'dealership:requestPos'
    )
);

mp.events.add(
    'server:garage:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:garage:setPos', [locationService.getPosition('garage')]);
        },
        'garage:requestPos'
    )
);

mp.events.add(
    'server:fuel:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:fuel:setPos', [locationService.getPosition('fuel')]);
        },
        'fuel:requestPos'
    )
);

mp.events.add(
    'server:courier:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:courier:setPos', [locationService.getPosition('courier')]);
        },
        'courier:requestPos'
    )
);

mp.events.add(
    'server:customCar:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:customCar:setPos', [locationService.getPosition('lsc')]);
        },
        'customCar:requestPos'
    )
);

mp.events.add(
    'server:shop:requestPos',
    withGuards([isLoggedIn], (player) => {
        player.call('client:shop:setPos', [locationService.getPosition('shop')]);
    })
);
