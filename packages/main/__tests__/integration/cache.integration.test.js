const { initDB } = require('../../core/db');
const { initRedis, getRedis } = require('../../core/redis');
const statsService = require('../../services/StatsService');
const moneyService = require('../../services/MoneyService');
const accountService = require('../../services/AccountService');
const { getUserModel } = require('../../models/Users');

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

describe('Кэш-aside экономика (MySQL + Redis)', () => {
    test('тёплый кэш читает из Redis и не видит прямых правок SQL', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'cache1', password: 'x', money: 100 });

        await statsService.getEconomyStats();

        await User.update({ money: 999 }, { where: { id: user.id } });

        const cached = await statsService.getCachedEconomy();
        expect(cached.totalMoney).toBe(100);
    });

    test('addMoney инвалидирует кэш — следующее чтение свежее', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'cache2', password: 'x', money: 100 });

        await statsService.getEconomyStats();

        await User.update({ money: 999 }, { where: { id: user.id } });
        expect((await statsService.getCachedEconomy()).totalMoney).toBe(100);

        const ok = await moneyService.addMoney(user.id, 1, 'тест');
        expect(ok).toBe(true);

        const fresh = await statsService.getCachedEconomy();
        expect(fresh.totalMoney).toBe(1000);
    });
});
