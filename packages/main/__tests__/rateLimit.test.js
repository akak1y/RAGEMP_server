const rateLimit = require('../middleware/rateLimit');

jest.mock('../core/redis', () => ({
    getRedis: jest.fn()
}));

jest.mock('../services/AuditService', () => ({
    logPlayer: jest.fn(),
    bumpRepeats: jest.fn()
}));

jest.mock('../core/logger', () => ({
    warn: jest.fn(),
    error: jest.fn()
}));

const { getRedis } = require('../core/redis');
const auditService = require('../services/AuditService');

describe('rateLimit middleware', () => {
    let mockRedis;
    let mockPlayer;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRedis = {
            incr: jest.fn(),
            expire: jest.fn(),
            get: jest.fn(),
            set: jest.fn()
        };
        getRedis.mockReturnValue(mockRedis);
        mockPlayer = { accountId: 1, accountName: 'Test', outputChatBox: jest.fn() };
    });

    test('пропускает первый вызов', async () => {
        mockRedis.incr.mockResolvedValue(1);
        mockRedis.expire.mockResolvedValue(1);

        const guard = rateLimit('test_action', 5, 60);
        const result = await guard(mockPlayer);

        expect(result).toBe(true);
        expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('ratelimit:'), 60);
    });

    test('пропускает вызовы в пределах лимита', async () => {
        mockRedis.incr.mockResolvedValue(3);

        const guard = rateLimit('test_action', 5, 60);
        const result = await guard(mockPlayer);

        expect(result).toBe(true);
        expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    test('блокирует при превышении лимита', async () => {
        mockRedis.incr
            .mockResolvedValueOnce(6) // основной ключ — превышение
            .mockResolvedValueOnce(1); // violKey — первое нарушение в окне
        mockRedis.expire.mockResolvedValue(1);
        mockRedis.set.mockResolvedValue('OK');
        auditService.logPlayer.mockResolvedValue({ id: 42 });

        const guard = rateLimit('test_action', 5, 60);
        const result = await guard(mockPlayer);

        expect(result).toBe(false);
        expect(mockPlayer.outputChatBox).toHaveBeenCalledWith(expect.stringContaining('Слишком часто'));
        expect(auditService.logPlayer).toHaveBeenCalled();
        expect(mockRedis.set).toHaveBeenCalled();
    });

    test('серия нарушений: repeats растёт у той же строки', async () => {
        mockRedis.incr
            .mockResolvedValueOnce(6) // основной ключ — превышение
            .mockResolvedValueOnce(2); // violKey — серия продолжается
        mockRedis.get.mockResolvedValue('42');

        const guard = rateLimit('test_action', 5, 60);
        const result = await guard(mockPlayer);

        expect(result).toBe(false);
        expect(auditService.bumpRepeats).toHaveBeenCalledWith(42);
        expect(auditService.logPlayer).not.toHaveBeenCalled(); // не создаём новую строку
    });

    test('fail open при ошибке Redis', async () => {
        mockRedis.incr.mockRejectedValue(new Error('Redis down'));

        const guard = rateLimit('test_action', 5, 60);
        const result = await guard(mockPlayer);

        expect(result).toBe(true);
    });
});