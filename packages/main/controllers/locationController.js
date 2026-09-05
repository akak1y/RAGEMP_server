const locationService = require('../services/LocationService');
const miningService = require('../services/MiningService');
const { MiningConfig, BotSpawnPos, PhoneConfig, MafiaBasePos, HospitalPos } = require('../config');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');

/**
 * Раздача координат игровых локаций клиентам (маркеры/blips).
 */

mp.events.add(
    'server:locations:requestAll',
    withGuards(
        [isLoggedIn],
        (player) => {
            const data = {
                dealership: locationService.getPosition('dealership'),
                garage: locationService.getPosition('garage'),
                carCustom: locationService.getPosition('lsc'),
                fuel: locationService.getPosition('fuel'),
                courierStart: locationService.getPosition('courier'),
                shop: locationService.getPosition('shop'),
                mining: {
                    rocks: MiningConfig.rocks,
                    botPos: BotSpawnPos,
                    active: miningService.getRocksActive(),
                },
                phonePrice: PhoneConfig.deliveryCar,
                mafiaBase: MafiaBasePos,
                hospital: HospitalPos,
            };
            player.call('client:locations:setAll', [JSON.stringify(data)]);
        },
        'locations:requestAll'
    )
);
