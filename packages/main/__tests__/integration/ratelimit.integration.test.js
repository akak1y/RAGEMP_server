const { initDB } = require('../../core/db');
const { initRedis, getRedis } = require('../../core/redis');
const rateLimit = require('../../middleware/rateLimit');

let sequelize;

function makePlayer(id) {
    return {
        accountId: id,
        accountName: 'rl_test_' + id,
        ip: '127.0.0.1',
        outputChatBox: () => {},
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
    sequelize = await initDB();
    await initRedis();
});

afterAll(async () => {
    const redis = getRedis();
    if (redis) await redis.quit().catch(() => {});
    await sequelize.close();
});

beforeEach(async () => {
    await getRedis().flushDb();
});

describe('RateLimit на живом Redis', () => {
    test('пропускает до лимита и блокирует после', async () => {
        const guard = rateLimit('int_action', 3, 5);
        const player = makePlayer(1);

        expect(await guard(player)).toBe(true);
        expect(await guard(player)).toBe(true);
        expect(await guard(player)).toBe(true);
        expect(await guard(player)).toBe(false);
    });

    test('разные игроки — раздельные счётчики', async () => {
        const guard = rateLimit('int_iso', 1, 5);

        expect(await guard(makePlayer(10))).toBe(true);
        expect(await guard(makePlayer(11))).toBe(true);
        expect(await guard(makePlayer(10))).toBe(false);
    });

    test('окно истекает — лимит отпускает', async () => {
        const guard = rateLimit('int_window', 1, 1);
        const player = makePlayer(20);

        expect(await guard(player)).toBe(true);
        expect(await guard(player)).toBe(false);

        await sleep(1200);

        expect(await guard(player)).toBe(true);
    }, 10000);
});
