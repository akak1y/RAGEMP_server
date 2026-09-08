const { ShopConfig } = require('../config');
const shopService = require('../services/ShopService');
const locationService = require('../services/LocationService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');

/**
 * Магазин: выдача позиции/конфига, покупка предметов
 */

mp.events.add(
    'server:shop:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            sendEvent(player, 'client:shop:setPos', [
                JSON.stringify(locationService.getPosition('shop')),
            ]);
        },
        'shop:requestPos'
    )
);

mp.events.add(
    'server:shop:requestConfig',
    withGuards(
        [isLoggedIn, rateLimit('shop:config', 10, 5)],
        (player) => {
            sendEvent(player, 'client:shop:show', [
                JSON.stringify({ name: ShopConfig.name, items: ShopConfig.items }),
            ]);
        },
        'shop:requestConfig'
    )
);

mp.events.add(
    'server:shop:buy',
    withGuards(
        [isLoggedIn, rateLimit('shop:buy', 10, 5)],
        async (player, itemId, amount) => {
            const result = await shopService.buyItem(player, itemId, amount);
            if (result.success) {
                sendEvent(player, 'client:shop:buyResult', [true, 'Покупка успешна']);
            } else {
                sendEvent(player, 'client:shop:buyResult', [false, result.error]);
            }
        },
        'shop:buy'
    )
);
