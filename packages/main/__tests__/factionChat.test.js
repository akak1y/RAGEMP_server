jest.mock('../services/ChatService', () => ({ send: jest.fn(), pushSystem: jest.fn() }));
jest.mock('../middleware/rateLimit', () => jest.fn(() => async () => true));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockCommandStore = new Map();
jest.mock('../controllers/commandSystem', () => ({
    registerCommand: (name, def) => mockCommandStore.set(name, def),
}));

global.mp = {
    events: { add: jest.fn() },
    players: { toArray: jest.fn(() => []) },
};

const chatService = require('../services/ChatService');
require('../controllers/factionController');

const makePlayer = (id, name) => ({
    accountId: id,
    accountName: name,
    isLoggedIn: true,
    outputChatBox: jest.fn(),
});

describe('Семейный чат /f', () => {
    let run;
    beforeEach(() => {
        jest.clearAllMocks();
        run = mockCommandStore.get('f').run;
    });

    test('guards: только isLoggedIn', () => {
        expect(mockCommandStore.get('f').guards).toHaveLength(1);
    });

    test('пустой текст — подсказка использования, без отправки', async () => {
        const p = makePlayer(1, 'A');
        await run(p, []);
        expect(p.outputChatBox).toHaveBeenCalledWith(expect.stringContaining('Использование'));
        expect(chatService.send).not.toHaveBeenCalled();
    });

    test('сообщение делегируется в ChatService (канал family)', async () => {
        const p = makePlayer(1, 'A');
        await run(p, ['сбор', 'у', 'базы']);
        expect(chatService.send).toHaveBeenCalledWith(p, 'family', 'сбор у базы');
    });

    test('отказ не-члену семьи обеспечивает ChatService', async () => {
        chatService.send.mockResolvedValue({ success: false, error: 'not_member' });
        const p = makePlayer(1, 'A');
        await run(p, ['привет']);
        expect(chatService.send).toHaveBeenCalledWith(p, 'family', 'привет');
    });
});
