const { initDB } = require('../../core/db');
const { initRedis, getRedis } = require('../../core/redis');
const shopService = require('../../services/ShopService');
const inventoryService = require('../../services/InventoryService');
const accountService = require('../../services/AccountService');
const { getUserModel } = require('../../models/Users');
const { getItemModel } = require('../../models/Item');

let sequelize;

beforeAll(async () => {
    sequelize = await initDB();
    await initRedis();
    accountService.initialize();
});

afterAll(async () => {
    const redis = getRedis();
    if (redis) await redis.quit().catch(() => {});
    await sequelize.close();
});

beforeEach(async () => {
    const User = getUserModel();
    await User.destroy({ where: {} });
    await getRedis().flushDb();
});

describe('ShopService — интеграционные тесты', () => {
    test('успешная покупка: деньги списаны, предмет в БД', async () => {
        const User = getUserModel();
        const Item = getItemModel();

        const user = await User.create({ username: 'shop1', password: 'x', money: 500 });
        const player = {
            accountId: user.id,
            accountName: 'shop1',
            inventory: null,
            call: () => {}, // заглушка RAGE MP API: syncInventory шлёт обновление клиенту
        };

        // Инициализируем инвентарь (как делает loadPlayerInventory в игре)
        await inventoryService.loadPlayerInventory(player);

        const result = await shopService.buyItem(player, 'burger', 2);
        expect(result).toBe(true);

        const updatedUser = await User.findByPk(user.id);
        expect(updatedUser.money).toBe(400); // 500 - 100

        const items = await Item.findAll({ where: { owner_id: user.id, item_id: 'burger' } });
        expect(items.length).toBeGreaterThan(0);
        const totalBurgers = items.reduce((sum, item) => sum + item.count, 0);
        expect(totalBurgers).toBe(2);
    });

    test('недостаточно денег: баланс не изменился, предметов нет', async () => {
        const User = getUserModel();
        const Item = getItemModel();

        const user = await User.create({ username: 'shop2', password: 'x', money: 50 });
        const player = {
            accountId: user.id,
            accountName: 'shop1',
            inventory: null,
            call: () => {}, // заглушка RAGE MP API
        };

        await inventoryService.loadPlayerInventory(player);

        const result = await shopService.buyItem(player, 'burger', 2);
        expect(result).toBe(false);

        const updatedUser = await User.findByPk(user.id);
        expect(updatedUser.money).toBe(50);

        const items = await Item.findAll({ where: { owner_id: user.id } });
        expect(items.length).toBe(0);
    });
});
