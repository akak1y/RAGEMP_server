const { WeaponConfig } = require('../config');
const inventoryService = require('./InventoryService');
const logger = require('../core/logger');

const UNARMED = 0x99b507ea; // joaat('unarmed')

/**
 * WeaponService — перезарядка оружия патронами из инвентаря.
 */
class WeaponService {
    hashOf(itemKey) {
        const cfg = WeaponConfig[itemKey];
        return cfg ? mp.joaat(cfg.hash) : null;
    }

    itemKeyByHash(hash) {
        for (const [key, cfg] of Object.entries(WeaponConfig)) {
            if (mp.joaat(cfg.hash) === hash) return key;
        }
        return null;
    }

    /** Оружейные слоты инвентаря игрока */
    listOwned(player) {
        if (!Array.isArray(player.inventory)) return [];
        return player.inventory.filter((s) => s && WeaponConfig[s.itemId]);
    }

    /** Ключ оружия в руках или null */
    heldKey(player) {
        const hash = player.weapon;
        if (!hash || hash === UNARMED) return null;
        return this.itemKeyByHash(hash);
    }

    /** Резерв патронов типа оружия */
    reserve(player, key) {
        const cfg = WeaponConfig[key];
        return cfg ? inventoryService.countItem(player, cfg.ammoType) : 0;
    }

    /** Выдать оружие предметом инвентаря */
    async give(player, key) {
        if (!WeaponConfig[key]) return { success: false, error: 'unknown_weapon' };
        return inventoryService.giveItem(player, key, 1);
    }

    /** Достать: ствол с 0 патронов (R — зарядить). Тот же ключ в руках — убрать */
    async draw(player, key) {
        const held = this.heldKey(player);
        const target = key || (this.listOwned(player)[0] || {}).itemId;
        if (!target || !WeaponConfig[target]) return { success: false, error: 'unknown_weapon' };
        if (held === target) return this.holster(player);
        if (!inventoryService.hasItem(player, target, 1))
            return { success: false, error: 'no_weapon_item' };
        if (held) await this.holster(player);
        player.giveWeapon(this.hashOf(target), 0);
        return { success: true, weapon: target };
    }

    /** Убрать из рук: патроны ствола возвращаются в резерв */
    async holster(player) {
        const hash = player.weapon;
        if (!hash || hash === UNARMED) return { success: false, error: 'no_weapon_in_hands' };
        const itemKey = this.itemKeyByHash(hash);
        if (!itemKey) {
            player.removeWeapon(hash);
            return { success: true, ammoReturned: 0, ammoLost: 0 };
        }
        const held = (player.weapons || []).find((w) => w.hash === hash);
        const ammo = held ? Math.max(0, Math.floor(held.ammo || 0)) : 0;
        let ammoReturned = 0;
        let ammoLost = 0;
        if (ammo > 0) {
            const res = await inventoryService.giveItem(
                player,
                WeaponConfig[itemKey].ammoType,
                ammo
            );
            if (res.success) ammoReturned = ammo;
            else ammoLost = ammo;
        }
        player.removeWeapon(hash);
        if (ammoLost)
            logger.warn(
                `[WeaponService] ${player.accountName}: инвентарь полон, потеряно ${ammoLost} патронов`
            );
        return { success: true, ammoReturned, ammoLost };
    }

    /** Перезарядка: все патроны нужного типа из инвентаря уходят в оружие */
    async reload(player) {
        const hash = player.weapon;
        if (!hash || hash === UNARMED) return { success: false, error: 'no_weapon' };
        const itemKey = this.itemKeyByHash(hash);
        if (!itemKey) return { success: false, error: 'no_weapon' };
        if (!inventoryService.hasItem(player, itemKey, 1))
            return { success: false, error: 'no_weapon_item' };
        const ammoKey = WeaponConfig[itemKey].ammoType;
        const ammoCount = inventoryService.countItem(player, ammoKey);
        if (ammoCount <= 0) return { success: false, error: 'no_ammo' };
        const removed = await inventoryService.removeItem(player, ammoKey, ammoCount);
        if (!removed.success) return { success: false, error: removed.error };
        player.giveWeapon(hash, ammoCount);
        logger.info(
            `[WeaponService] ${player.accountName} перезарядка: +${ammoCount} патронов (${itemKey})`
        );
        return { success: true, loaded: ammoCount };
    }
}
module.exports = new WeaponService();
