const weaponService = require('../services/WeaponService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');

/**
 * Оружие: перезарядка патронами из инвентаря.
 */
const RELOAD_MESSAGES = {
    no_weapon: 'Нет оружия в руках',
    no_weapon_item: 'Оружие не найдено в инвентаре',
    no_ammo: 'Нет патронов в инвентаре',
};

mp.events.add(
    'server:weapon:reload',
    withGuards(
        [isLoggedIn, rateLimit('weapon:reload', 3, 5)],
        async (player) => {
            const result = await weaponService.reload(player);
            const message = result.success
                ? `Перезарядка: +${result.loaded} патронов`
                : RELOAD_MESSAGES[result.error] || 'Невозможно перезарядить';
            sendEvent(player, 'client:weapon:reloadResult', [result.success, message]);
        },
        'weapon:reload'
    )
);
