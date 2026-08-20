const auditService = require('../services/AuditService');
const { getAuditModel } = require('../models/AuditLog');
const { getRedis } = require('../core/redis');

jest.mock('../models/AuditLog', () => ({
    getAuditModel: jest.fn(),
    ensureAuditReady: jest.fn().mockResolvedValue(true),
}));

jest.mock('../core/redis', () => ({ getRedis: jest.fn() }));

jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

describe('AuditService', () => {
    let mockModel, mockRedis;
    const fakePlayer = {
        accountName: 'akak',
        accountId: 4,
        ip: '127.0.0.1',
        position: { x: 1, y: 2, z: 3 },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockModel = {
            create: jest.fn().mockResolvedValue({}),
            findAll: jest.fn().mockResolvedValue([]),
        };
        getAuditModel.mockReturnValue(mockModel);
        mockRedis = { incr: jest.fn(), expire: jest.fn(), del: jest.fn() };
        getRedis.mockReturnValue(mockRedis);
    });

    describe('logPlayer', () => {
        test('без withPosition — details пустой', async () => {
            await auditService.logPlayer(fakePlayer, 'pay', { category: 'money', amount: 500 });
            expect(mockModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: 'akak',
                    actor_id: 4,
                    ip: '127.0.0.1',
                    category: 'money',
                    amount: 500,
                    details: null,
                })
            );
        });

        test('withPosition — позиция в details', async () => {
            await auditService.logPlayer(fakePlayer, 'buy_vehicle', { withPosition: true });
            expect(mockModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    details: expect.stringContaining('1.0,2.0,3.0'),
                })
            );
        });
    });

    describe('trackFail', () => {
        test('ниже порога — в БД не пишем', async () => {
            mockRedis.incr.mockResolvedValue(5);
            await auditService.trackFail(fakePlayer, 'buy_fail');
            expect(mockModel.create).not.toHaveBeenCalled();
        });

        test('на пороге — одна строка с repeats + очистка ключа', async () => {
            mockRedis.incr.mockResolvedValue(20);
            await auditService.trackFail(fakePlayer, 'buy_fail');
            expect(mockModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'buy_fail',
                    success: false,
                    repeats: 20,
                    category: 'security',
                })
            );
            expect(mockRedis.del).toHaveBeenCalledWith('audit:fail:buy_fail:4');
        });

        test('первый провал ставит TTL окну', async () => {
            mockRedis.incr.mockResolvedValue(1);
            await auditService.trackFail(fakePlayer, 'buy_fail');
            expect(mockRedis.expire).toHaveBeenCalledWith('audit:fail:buy_fail:4', 60);
        });
    });
});
