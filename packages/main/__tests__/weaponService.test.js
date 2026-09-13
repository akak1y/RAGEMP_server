jest.mock('../services/InventoryService', () => ({
    hasItem: jest.fn(),
    countItem: jest.fn(),
    removeItem: jest.fn(),
}));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    WeaponConfig: {
        weapon_pistol: { hash: 'weapon_pistol', name: 'Пистолет', ammo: 'ammo_9mm' },
    },
}));

global.mp = { joaat: jest.fn((s) => s) };

const weaponService = require('../services/WeaponService');
const inventoryService = require('../services/InventoryService');

const makePlayer = (weapon) => ({
    accountName: 'Test',
    weapon,
    giveWeapon: jest.fn(),
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
