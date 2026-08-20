const { ShopConfig } = require('../config');
const shopService = require('../services/ShopService');
const locationService = require('../services/LocationService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');

/**
 * Магазин: выдача позиции/конфига, покупка предметов
 */

mp.events.add(
    'server:shop:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:shop:setPos', [
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
            player.call('client:shop:show', [
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
            const ok = await shopService.buyItem(player, String(itemId), Number(amount));

            const resultMessage = ok
                ? `Куплено: ${itemId} x${amount}`
                : 'Покупка не удалась: недостаточно денег или места в инвентаре';

            player.call('client:shop:buyResult', [ok, resultMessage]);
        },
        'shop:buy'
    )
);
