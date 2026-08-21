const { initDB } = require('../../core/db');
const { initRedis, getRedis } = require('../../core/redis');
const miningService = require('../../services/MiningService');
const inventoryService = require('../../services/InventoryService');
const accountService = require('../../services/AccountService');
const { getUserModel } = require('../../models/Users');
const { getItemModel } = require('../../models/Item');
const { MiningConfig, BotSpawnPos } = require('../../config');

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
    await getUserModel().destroy({ where: {} });
    await getRedis().flushDb();
    miningService.activeMiners.clear();
    miningService.shiftStats.clear();
});

describe('Шахта — интеграционные тесты', () => {
    test('полный цикл: добыл → руда в БД → продал боту → деньги', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'miner1', password: 'x', money: 0 });
        const player = {
            accountId: user.id,
            accountName: 'miner1',
            position: {
                x: MiningConfig.rocks[0].x,
                y: MiningConfig.rocks[0].y,
                z: MiningConfig.rocks[0].z,
            },
            call: () => {},
            inventory: null,
        };
        await inventoryService.loadPlayerInventory(player);

        for (let i = 0; i < 3; i++) {
            miningService.startWork(player, 0);
            miningService.activeMiners.get(user.id).startedAt -= MiningConfig.mineTimeMs + 100;
            expect(await miningService.completeMine(player)).toBe(true);
        }

        const items = await getItemModel().findAll({
            where: { owner_id: user.id, item_id: 'ore' },
        });
        expect(items.reduce((s, it) => s + it.count, 0)).toBe(3);

        player.position = { x: BotSpawnPos.x, y: BotSpawnPos.y, z: BotSpawnPos.z };
        const result = await miningService.sellAllOre(player);
        expect(result.success).toBe(true);

        const updated = await User.findByPk(user.id);
        expect(updated.money).toBe(3 * MiningConfig.oreSellPrice);
        const after = await getItemModel().findAll({ where: { owner_id: user.id, item_id: 'ore' } });
        expect(after.length).toBe(0);
    });

    test('лимит за смену: сверх maxOrePerShift не добыть', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'miner2', password: 'x', money: 0 });
        const player = {
            accountId: user.id,
            accountName: 'miner2',
            position: {
                x: MiningConfig.rocks[0].x,
                y: MiningConfig.rocks[0].y,
                z: MiningConfig.rocks[0].z,
            },
            call: () => {},
            inventory: null,
        };
        await inventoryService.loadPlayerInventory(player);

        miningService.shiftStats.set(user.id, MiningConfig.maxOrePerShift);
        miningService.startWork(player, 0);
        miningService.activeMiners.get(user.id).startedAt -= MiningConfig.mineTimeMs + 100;
        expect(await miningService.completeMine(player)).toBe(false);
    });
});