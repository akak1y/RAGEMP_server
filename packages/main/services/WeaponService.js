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

    /** Перезарядка: все патроны нужного типа из инвентаря уходят в оружие */
    async reload(player) {
        const hash = player.weapon;
        if (!hash || hash === UNARMED) return { success: false, error: 'no_weapon' };
        const itemKey = this.itemKeyByHash(hash);
        if (!itemKey) return { success: false, error: 'no_weapon' };
        if (!inventoryService.hasItem(player, itemKey, 1))
            return { success: false, error: 'no_weapon_item' };
        const ammoKey = WeaponConfig[itemKey].ammo;
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
