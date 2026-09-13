const { WeaponConfig } = require('../config');
const weaponService = require('../services/WeaponService');
const auditService = require('../services/AuditService');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { registerCommand } = require('./commandSystem');
const { sendEvent } = require('../core/eventSender');

/**
 * Оружие: перезарядка (R), достать/убрать, админ-выдача.
 */
const RELOAD_MESSAGES = {
    no_weapon: 'Нет оружия в руках',
    no_weapon_item: 'Оружие не найдено в инвентаре',
    no_ammo: 'Нет патронов в инвентаре',
};

const WEAPON_MESSAGES = {
    unknown_weapon: 'Неизвестное оружие. Список: /guns',
    no_weapon_item: 'Нет такого оружия в инвентаре',
    no_weapon_in_hands: 'В руках уже пусто',
};

const adminOnly = isAdmin(1);
const holsterLimit = rateLimit('weapon:holster', 4, 5);

function findOnlinePlayer(arg) {
    if (!arg) return null;
    const list = mp.players.toArray().filter((p) => p.isLoggedIn);
    if (/^\d+$/.test(arg)) return list.find((p) => p.accountId === Number(arg));
    return list.find((p) => (p.accountName || '').toLowerCase() === String(arg).toLowerCase());
}

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

registerCommand('guns', {
    guards: [isLoggedIn],
    run: (player) => {
        const owned = weaponService.listOwned(player);
        if (!owned.length)
            return player.outputChatBox('!{#FF3333}[Оружие] Нет оружия в инвентаре.');
        const held = weaponService.heldKey(player);
        player.outputChatBox('!{#FFCC00}[Оружие] Ваш арсенал:');
        for (const slot of owned) {
            const cfg = WeaponConfig[slot.itemId];
            const mark = slot.itemId === held ? ' !{#4CAF50}(в руках)' : '';
            player.outputChatBox(
                `!{#CCCCCC}${slot.itemId} — ${cfg.name}, резерв: ${weaponService.reserve(
                    player,
                    slot.itemId
                )}${mark}`
            );
        }
        player.outputChatBox('!{#CCCCCC}/gun [key] — достать, /holster — убрать, R — перезарядка');
    },
});

registerCommand('gun', {
    guards: [isLoggedIn],
    run: async (player, args) => {
        const key = args[0] ? String(args[0]).toLowerCase() : null;
        const res = await weaponService.draw(player, key);
        if (!res.success)
            return player.outputChatBox(
                `!{#FF3333}[Оружие] ${WEAPON_MESSAGES[res.error] || res.error}`
            );
        if (res.ammoReturned !== undefined)
            return player.outputChatBox(
                `!{#4CAF50}[Оружие] Убрано. Патронов в резерв: ${res.ammoReturned}.`
            );
        player.outputChatBox(
            `!{#4CAF50}[Оружие] В руках: ${WeaponConfig[res.weapon].name}. R — перезарядка.`
        );
    },
});

registerCommand('holster', {
    guards: [isLoggedIn],
    run: async (player) => {
        if (!(await holsterLimit(player))) return;
        const res = await weaponService.holster(player);
        if (!res.success)
            return player.outputChatBox(
                `!{#FF3333}[Оружие] ${WEAPON_MESSAGES[res.error] || res.error}`
            );
        player.outputChatBox(
            res.ammoLost
                ? `!{#FFCC00}[Оружие] Убрано, но инвентарь полон: потеряно ${res.ammoLost} патронов.`
                : `!{#4CAF50}[Оружие] Убрано. Патронов в резерв: ${res.ammoReturned}.`
        );
    },
});

registerCommand('giveweapon', {
    guards: [isLoggedIn, adminOnly],
    run: async (player, args) => {
        const [targetArg, keyArg] = args;
        const key = String(keyArg || '').toLowerCase();
        if (!WeaponConfig[key])
            return player.outputChatBox(
                `!{#FF3333}[Оружие] Ключи: ${Object.keys(WeaponConfig).join(', ')}`
            );
        const target = findOnlinePlayer(targetArg) || player;
        const res = await weaponService.give(target, key);
        if (!res.success) return player.outputChatBox(`!{#FF3333}[Оружие] ${res.error}`);
        auditService.logPlayer(player, 'giveweapon', {
            category: 'admin',
            target: target.accountId,
            details: { weapon: key },
        });
        player.outputChatBox(`!{#4CAF50}[Оружие] Выдано ${key} игроку ${target.accountName}.`);
        if (target !== player)
            target.outputChatBox(`!{#4CAF50}[Оружие] Получено: ${key}. /gun — достать.`);
    },
});
