const { WeaponConfig } = require('../config');
const inventoryService = require('./InventoryService');

/**
 * WeaponService — перезарядка оружия патронами из инвентаря.
 */
class WeaponService {
    config(key) {
        return WeaponConfig[key] || null;
    }

    hashOf(key) {
        const cfg = this.config(key);
        return cfg ? mp.joaat(cfg.hash) : null;
    }

    heldKey(player) {
        const w = player.weapon;
        if (!w || w === 0x99b507ea || w === mp.joaat('unarmed')) return null;

        if (typeof w === 'string' && this.config(w)) return w;

        for (const [key, cfg] of Object.entries(WeaponConfig)) {
            if (this.hashOf(key) === w) return key;
        }
        return null;
    }

    _ammoInHands(player, key) {
        const hash = this.hashOf(key);
        if (player.weapons && Array.isArray(player.weapons)) {
            const w = player.weapons.find((w) => w.hash === hash || w.hash === key);
            if (w) return w.ammo || 0;
        }
        if (!player.weaponAmmo) player.weaponAmmo = {};
        return player.weaponAmmo[key] || 0;
    }

    _setAmmoInHands(player, key, value) {
        if (!player.weaponAmmo) player.weaponAmmo = {};
        player.weaponAmmo[key] = value;
    }

    listOwned(player) {
        if (!player.inventory) return [];
        return player.inventory.filter((slot) => slot && this.config(slot.itemId));
    }

    async give(player, key) {
        if (!this.config(key)) return { success: false, error: 'unknown_weapon' };
        const res = await inventoryService.giveItem(player, key, 1);
        if (!res || !res.success) return { success: false, error: res?.error || 'inventory_error' };
        return { success: true };
    }

    /** Достать ствол в руки. Патроны остаются в резерве до перезарядки. */
    async draw(player, key) {
        const cfg = this.config(key);
        if (!cfg) return { success: false, error: 'unknown_weapon' };
        if (!inventoryService.hasItem(player, key, 1))
            return { success: false, error: 'no_weapon_item' };

        const held = this.heldKey(player);
        if (held === key) return this.holster(player);

        if (held) {
            const holstered = await this.holster(player);
            if (!holstered.success) return holstered;
        }

        player.weapon = key;
        this._setAmmoInHands(player, key, 0);
        player.giveWeapon(this.hashOf(key), 0);
        return { success: true, weapon: key };
    }

    /** Убрать из рук: патроны ствола возвращаются в резерв */
    async holster(player) {
        const held = this.heldKey(player);
        if (!held) return { success: false, error: 'no_weapon_in_hands' };

        const cfg = this.config(held);
        const inHands = this._ammoInHands(player, held);
        let ammoReturned = 0;
        let ammoLost = 0;

        if (inHands > 0 && cfg && cfg.ammoType) {
            const res = await inventoryService.giveItem(player, cfg.ammoType, inHands);
            if (res && res.success) ammoReturned = inHands;
            else ammoLost = inHands;
        }

        player.removeWeapon(this.hashOf(held));
        this._setAmmoInHands(player, held, 0);
        player.weapon = null;
        return { success: true, ammoReturned, ammoLost };
    }

    /** Перезарядка: резерв патронов из инвентаря уходит в ствол. */
    async reload(player) {
        const held = this.heldKey(player);
        if (!held) return { success: false, error: 'no_weapon' };
        const cfg = this.config(held);
        if (!cfg) return { success: false, error: 'no_weapon' };

        if (!inventoryService.hasItem(player, held, 1))
            return { success: false, error: 'no_weapon_item' };

        if (!cfg.ammoType) return { success: false, error: 'no_ammo' };

        const reserve = inventoryService.countItem(player, cfg.ammoType);
        if (reserve <= 0) return { success: false, error: 'no_ammo' };

        const res = await inventoryService.removeItem(player, cfg.ammoType, reserve);
        if (!res || !res.success)
            return { success: false, error: (res && res.error) || 'inventory_error' };

        this._setAmmoInHands(player, held, this._ammoInHands(player, held) + reserve);
        player.giveWeapon(this.hashOf(held), reserve);
        return { success: true, loaded: reserve };
    }
}
module.exports = new WeaponService();
