global.mp = {
    joaat: jest.fn((s) => `hash_${s}`),
    Vector3: class {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z
        }
    },
    peds: {
        new: jest.fn(() => ({ id: 42, rotation: null }))
    },
    labels: { new: jest.fn(() => ({})) },
    colshapes: { newSphere: jest.fn(() => ({ id: 1 })) },
    players: { forEach: jest.fn() },
    events: { add: jest.fn() }
};

jest.mock('../models/Bot', () => ({
    getBotModel: jest.fn(() => ({ upsert: jest.fn() })),
    ensureBotReady: jest.fn().mockResolvedValue()
}));
jest.mock('../services/AccountService', () => ({
    getModel: jest.fn()
}));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    BotSpawnPos: { x: 100, y: 200, z: 30, h: 90 },
    BotPedModel: 's_m_y_cop_01'
}));

const botService = require('../services/BotService');
const accountService = require('../services/AccountService');

describe('BotService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        botService.bots.clear();
        botService.shapes.clear();
    });

    describe('spawn', () => {
        test('аккаунт существует', async () => {
            const User = { findOne: jest.fn().mockResolvedValue({ id: 5, username: 'TestBot' }) };
            accountService.getModel.mockReturnValue(User);
            
            await botService.spawn('TestBot');
            
            expect(User.findOne).toHaveBeenCalledWith({ where: { username: 'TestBot' } });
            expect(global.mp.peds.new).toHaveBeenCalled();
            expect(global.mp.labels.new).toHaveBeenCalledWith('TestBot (5)', expect.any(Object), expect.any(Object));
            expect(global.mp.colshapes.newSphere).toHaveBeenCalledWith(100, 200, 30, 5);
            expect(botService.bots.has('TestBot')).toBe(true);
        });
        test('аккаунт не существует — создаём', async () => {
            const User = {
                findOne: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 6, username: 'NewBot' })
            };
            accountService.getModel.mockReturnValue(User);
            
            await botService.spawn('NewBot');
            
            expect(User.create).toHaveBeenCalledWith({
                username: 'NewBot',
                password: 'bot_no_login',
                money: 10000
            });
            expect(botService.bots.has('NewBot')).toBe(true);
        });
    });

    describe('sendBotsTo', () => {
        test('player.call для каждого бота', async () => {
            const User = { findOne: jest.fn().mockResolvedValue({ id: 5 }) };
            accountService.getModel.mockReturnValue(User);
            await botService.spawn('Bot1');
            
            const player = { call: jest.fn() };
            botService.sendBotsTo(player);
            
            expect(player.call).toHaveBeenCalledWith('client:bot:setup', [42, 90]);
        });
    });

    describe('getAccountId', () => {
        test('есть бот', async () => {
            const User = { findOne: jest.fn().mockResolvedValue({ id: 5 }) };
            accountService.getModel.mockReturnValue(User);
            await botService.spawn('TestBot');
            
            expect(botService.getAccountId('TestBot')).toBe(5);
        });
        test('нет бота', () => {
            expect(botService.getAccountId('nope')).toBeNull();
        });
    });

    describe('isBot', () => {
        test('true', async () => {
            const User = { findOne: jest.fn().mockResolvedValue({ id: 5 }) };
            accountService.getModel.mockReturnValue(User);
            await botService.spawn('TestBot');
            
            expect(botService.isBot('TestBot')).toBe(true);
        });
        test('false', () => {
            expect(botService.isBot('nope')).toBe(false);
        });
    });

    describe('findBotName', () => {
        test('case-insensitive', async () => {
            const User = { findOne: jest.fn().mockResolvedValue({ id: 5 }) };
            accountService.getModel.mockReturnValue(User);
            await botService.spawn('TestBot');
            
            expect(botService.findBotName('testbot')).toBe('TestBot');
            expect(botService.findBotName('TESTBOT')).toBe('TestBot');
        });
        test('не найден', () => {
            expect(botService.findBotName('nope')).toBeNull();
        });
    });

    describe('getNameByAccountId', () => {
        test('есть', async () => {
            const User = { findOne: jest.fn().mockResolvedValue({ id: 5 }) };
            accountService.getModel.mockReturnValue(User);
            await botService.spawn('TestBot');
            
            expect(botService.getNameByAccountId(5)).toBe('TestBot');
        });
        test('нет', () => {
            expect(botService.getNameByAccountId(99)).toBeNull();
        });
    });
});