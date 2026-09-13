jest.mock('../services/InventoryService', () => ({
    hasItem: jest.fn(),
    countItem: jest.fn(),
    removeItem: jest.fn(),
    giveItem: jest.fn(),
}));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    WeaponConfig: {
        weapon_pistol: { hash: 'weapon_pistol', name: 'Пистолет', ammoType: 'ammo_9mm' },
        weapon_knife: { hash: 'weapon_knife', name: 'Нож', ammoType: null },
    },
}));

global.mp = { joaat: jest.fn((s) => s) };

const weaponService = require('../services/WeaponService');
const inventoryService = require('../services/InventoryService');

const makePlayer = (weapon) => ({
    accountName: 'Test',
    inventory: [{ itemId: 'weapon_pistol', count: 1 }],
    weapon,
    weapons: [],
    giveWeapon: jest.fn(),
    removeWeapon: jest.fn(),
});

describe('WeaponService.reload', () => {
    beforeEach(() => jest.clearAllMocks());

    test('без оружия (unarmed) — no_weapon', async () => {
        const res = await weaponService.reload(makePlayer(0x99b507ea));
        expect(res).toEqual({ success: false, error: 'no_weapon' });
    });

    test('оружие вне конфига — no_weapon', async () => {
        const res = await weaponService.reload(makePlayer('weapon_unknown'));
        expect(res).toEqual({ success: false, error: 'no_weapon' });
    });

    test('нет предмета оружия в инвентаре — no_weapon_item', async () => {
        inventoryService.hasItem.mockReturnValue(false);
        const res = await weaponService.reload(makePlayer('weapon_pistol'));
        expect(res).toEqual({ success: false, error: 'no_weapon_item' });
    });

    test('нет патронов — no_ammo', async () => {
        inventoryService.hasItem.mockReturnValue(true);
        inventoryService.countItem.mockReturnValue(0);
        const res = await weaponService.reload(makePlayer('weapon_pistol'));
        expect(res).toEqual({ success: false, error: 'no_ammo' });
    });

    test('успех: патроны из инвентаря уходят в оружие', async () => {
        inventoryService.hasItem.mockReturnValue(true);
        inventoryService.countItem.mockReturnValue(30);
        inventoryService.removeItem.mockResolvedValue({ success: true });
        const player = makePlayer('weapon_pistol');
        const res = await weaponService.reload(player);
        expect(res).toEqual({ success: true, loaded: 30 });
        expect(inventoryService.removeItem).toHaveBeenCalledWith(player, 'ammo_9mm', 30);
        expect(player.giveWeapon).toHaveBeenCalledWith('weapon_pistol', 30);
    });

    test('ошибка снятия из инвентаря — giveWeapon не вызывается', async () => {
        inventoryService.hasItem.mockReturnValue(true);
        inventoryService.countItem.mockReturnValue(30);
        inventoryService.removeItem.mockResolvedValue({ success: false, error: 'db_error' });
        const player = makePlayer('weapon_pistol');
        const res = await weaponService.reload(player);
        expect(res).toEqual({ success: false, error: 'db_error' });
        expect(player.giveWeapon).not.toHaveBeenCalled();
    });
});

describe('WeaponService.draw / holster', () => {
    beforeEach(() => jest.clearAllMocks());

    test('draw без предмета в инвентаре — no_weapon_item', async () => {
        inventoryService.hasItem.mockReturnValue(false);
        const res = await weaponService.draw(makePlayer(null), 'weapon_pistol');
        expect(res).toEqual({ success: false, error: 'no_weapon_item' });
        expect(makePlayer(null).giveWeapon).not.toHaveBeenCalled();
    });

    test('draw: ствол с 0 патронов, резерв ждёт R', async () => {
        inventoryService.hasItem.mockReturnValue(true);
        const player = makePlayer(null);
        const res = await weaponService.draw(player, 'weapon_pistol');
        expect(res).toEqual({ success: true, weapon: 'weapon_pistol' });
        expect(player.giveWeapon).toHaveBeenCalledWith('weapon_pistol', 0);
    });

    test('draw тем же ключом — toggle в holster', async () => {
        inventoryService.hasItem.mockReturnValue(true);
        inventoryService.giveItem.mockResolvedValue({ success: true });
        const player = makePlayer('weapon_pistol');
        player.weapons = [{ hash: 'weapon_pistol', ammo: 12 }];
        const res = await weaponService.draw(player, 'weapon_pistol');
        expect(res).toEqual({ success: true, ammoReturned: 12, ammoLost: 0 });
        expect(inventoryService.giveItem).toHaveBeenCalledWith(player, 'ammo_9mm', 12);
        expect(player.removeWeapon).toHaveBeenCalledWith('weapon_pistol');
    });

    test('смена ствола: патроны старого возвращаются до выдачи нового', async () => {
        inventoryService.hasItem.mockReturnValue(true);
        inventoryService.giveItem.mockResolvedValue({ success: true });
        const player = makePlayer('weapon_pistol');
        player.weapons = [{ hash: 'weapon_pistol', ammo: 5 }];
        player.inventory.push({ itemId: 'weapon_knife', count: 1 });
        const res = await weaponService.draw(player, 'weapon_knife');
        expect(res).toEqual({ success: true, weapon: 'weapon_knife' });
        expect(inventoryService.giveItem).toHaveBeenCalledWith(player, 'ammo_9mm', 5);
        expect(player.removeWeapon).toHaveBeenCalledWith('weapon_pistol');
        expect(player.giveWeapon).toHaveBeenCalledWith('weapon_knife', 0);
    });

    test('holster без оружия — no_weapon_in_hands', async () => {
        const res = await weaponService.holster(makePlayer(0x99b507ea));
        expect(res).toEqual({ success: false, error: 'no_weapon_in_hands' });
    });

    test('holster: инвентарь полон — ammoLost, ствол снят', async () => {
        inventoryService.giveItem.mockResolvedValue({ success: false, error: 'full' });
        const player = makePlayer('weapon_pistol');
        player.weapons = [{ hash: 'weapon_pistol', ammo: 20 }];
        const res = await weaponService.holster(player);
        expect(res).toEqual({ success: true, ammoReturned: 0, ammoLost: 20 });
        expect(player.removeWeapon).toHaveBeenCalledWith('weapon_pistol');
    });
});

describe('WeaponService.give', () => {
    beforeEach(() => jest.clearAllMocks());

    test('неизвестный ключ — отказ', async () => {
        const res = await weaponService.give(makePlayer(null), 'weapon_minigun');
        expect(res).toEqual({ success: false, error: 'unknown_weapon' });
        expect(inventoryService.giveItem).not.toHaveBeenCalled();
    });

    test('успех — предмет через инвентарь', async () => {
        inventoryService.giveItem.mockResolvedValue({ success: true });
        const player = makePlayer(null);
        const res = await weaponService.give(player, 'weapon_pistol');
        expect(res).toEqual({ success: true });
        expect(inventoryService.giveItem).toHaveBeenCalledWith(player, 'weapon_pistol', 1);
    });
});

describe('целостность реального конфига', () => {
    test('ammoType каждого оружия существует в ItemConfig', () => {
        const real = jest.requireActual('../config');
        for (const [key, cfg] of Object.entries(real.WeaponConfig)) {
            expect(real.ItemConfig[key]).toBeDefined();
            if (cfg.ammoType) expect(real.ItemConfig[cfg.ammoType]).toBeDefined();
        }
    });
});
