jest.mock('../core/db', () => ({ getSequelize: jest.fn() }));
jest.mock('../core/redis', () => ({ getRedis: jest.fn() }));
jest.mock('../models/Users', () => ({ getUserModel: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../core/profiler', () => jest.fn((label, fn) => fn()));

const statsService = require('../services/StatsService');
const { getRedis } = require('../core/redis');
const { getUserModel } = require('../models/Users');

global.mp = {
    players: { length: 3 },
    vehicles: { length: 7 },
};

describe('StatsService', () => {
    let redis, Users;
    beforeEach(() => {
        jest.clearAllMocks();
        redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
        getRedis.mockReturnValue(redis);
        Users = { findAll: jest.fn() };
        getUserModel.mockReturnValue(Users);
    });

    test('тёплый кэш: источник redis, MySQL не трогаем', async () => {
        redis.get.mockResolvedValue(
            JSON.stringify({ total: 5, totalMoney: 100, avgMoney: 20, maxMoney: 50 })
        );
        const s = await statsService.getEconomyStats();
        expect(s.source).toBe('redis');
        expect(s.total).toBe(5);
        expect(Users.findAll).not.toHaveBeenCalled();
    });

    test('холодный кэш: агрегация из MySQL + запись в Redis', async () => {
        redis.get.mockResolvedValue(null);
        Users.findAll.mockResolvedValue([
            { total: '5', totalMoney: '100', avgMoney: '20', maxMoney: '50' },
        ]);
        const s = await statsService.getEconomyStats();
        expect(s.source).toBe('mysql');
        expect(s.total).toBe(5);
        expect(redis.set).toHaveBeenCalled();
    });

    test('getTopPlayers: findAll с лимитом', async () => {
        Users.findAll.mockResolvedValue([]);
        await statsService.getTopPlayers(3);
        expect(Users.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    });

    test('getOnlineStats: онлайн и машины из mp', () => {
        expect(statsService.getOnlineStats()).toEqual({ online: 3, vehicles: 7 });
    });

    test('invalidateEconomyCache: del ключа', async () => {
        await statsService.invalidateEconomyCache();
        expect(redis.del).toHaveBeenCalled();
    });

    test('benchmarkRedis: N запросов', async () => {
        redis.get.mockResolvedValue(null);
        const r = await statsService.benchmarkRedis(10);
        expect(r.iterations).toBe(10);
        expect(redis.get).toHaveBeenCalledTimes(10);
    });
});
