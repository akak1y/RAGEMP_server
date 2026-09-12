const locationService = require('../services/LocationService');
const miningService = require('../services/MiningService');
const {
    MiningConfig,
    BotConfig,
    PhoneConfig,
    MafiaBasePos,
    HospitalPos,
    HospitalConfig,
} = require('../config');
const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');

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
                    botPos: BotConfig.position,
                    active: miningService.getRocksActive(),
                },
                phonePrice: PhoneConfig.deliveryCar,
                hospitalPrice: HospitalConfig.healPrice,
                mafiaBase: MafiaBasePos,
                hospital: HospitalPos,
            };
            sendEvent(player, 'client:locations:setAll', [JSON.stringify(data)]);
        },
        'locations:requestAll'
    )
);
