const weaponService = require('../services/WeaponService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { registerCommand } = require('./commandSystem');

/**
 * Оружие: достать / убрать / перезарядка.
 */
const reloadLimit = rateLimit('weapon:reload', 3, 5);

mp.events.add(
    'server:weapon:reload',
    withGuards(
        [isLoggedIn, reloadLimit],
        async (player) => {
            const res = await weaponService.reload(player);
            if (!res.success) {
                const msgs = {
                    no_weapon: 'Сначала достаньте оружие: /gun [key]',
                    no_ammo: 'Нет патронов в инвентаре.',
                    no_weapon_item: 'У вас нет этого оружия в инвентаре.',
                };
                return player.outputChatBox(`!{#FF3333}[Оружие] ${msgs[res.error] || res.error}`);
            }
            player.outputChatBox(`!{#4CAF50}[Оружие] Перезарядка: +${res.loaded} патронов.`);
        },
        'weapon:reload'
    )
);

registerCommand('gun', {
    guards: [isLoggedIn],
    run: async (player, args) => {
        const owned = weaponService.listOwned(player);
        const key = args[0] ? String(args[0]).toLowerCase() : owned[0] && owned[0].itemId;
        if (!key) return player.outputChatBox('!{#FF3333}[Оружие] У вас нет оружия.');

        const res = await weaponService.draw(player, key);
        if (!res.success) {
            const msgs = {
                unknown_weapon: 'Неизвестное оружие.',
                no_weapon_item: 'У вас нет этого оружия в инвентаре.',
                already_in_hands: 'Это оружие уже в руках.',
            };
            return player.outputChatBox(`!{#FF3333}[Оружие] ${msgs[res.error] || res.error}`);
        }

        if (res.ammoReturned !== undefined) {
            return player.outputChatBox(`!{#4CAF50}[Оружие] Оружие убрано.`);
        }
        player.outputChatBox(`!{#4CAF50}[Оружие] Достали ${key}. R — перезарядка.`);
    },
});

registerCommand('holster', {
    guards: [isLoggedIn],
    run: async (player) => {
        const res = await weaponService.holster(player);
        if (!res.success) return player.outputChatBox('!{#FF3333}[Оружие] Оружие не в руках.');
        player.outputChatBox('!{#4CAF50}[Оружие] Оружие убрано.');
    },
});

registerCommand('guns', {
    guards: [isLoggedIn],
    run: (player) => {
        const owned = weaponService.listOwned(player);
        if (!owned.length) return player.outputChatBox('!{#FF3333}[Оружие] У вас нет оружия.');
        player.outputChatBox('!{#00FFFF}[Оружие] Ваш арсенал:');
        owned.forEach((s) => {
            const cfg = weaponService.config(s.itemId);
            const mark = weaponService.heldKey(player) === s.itemId ? ' (в руках)' : '';
            player.outputChatBox(`!{#CCCCCC}${s.itemId} — ${cfg.name}${mark}`);
        });
    },
});
