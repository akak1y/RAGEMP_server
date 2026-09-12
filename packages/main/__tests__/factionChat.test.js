jest.mock('../services/FactionService', () => ({
    getMembership: jest.fn(),
    getMembers: jest.fn(),
    getRanks: jest.fn(() => [
        { id: 0, name: 'Шестёрка' },
        { id: 4, name: 'Босс' },
    ]),
    rankName: jest.fn((r) => `rank${r}`),
    addMember: jest.fn(),
    removeMember: jest.fn(),
}));
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

const factionService = require('../services/FactionService');
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

    test('пустой текст — подсказка использования', async () => {
        const p = makePlayer(1, 'A');
        await run(p, []);
        expect(p.outputChatBox).toHaveBeenCalledWith(expect.stringContaining('Использование'));
        expect(factionService.getMembership).not.toHaveBeenCalled();
    });

    test('не член семьи — отказ без рассылки', async () => {
        factionService.getMembership.mockResolvedValue(null);
        const p = makePlayer(1, 'A');
        await run(p, ['привет']);
        expect(p.outputChatBox).toHaveBeenCalledWith(expect.stringContaining('не состоите'));
    });

    test('сообщение получают только онлайн-члены семьи', async () => {
        factionService.getMembership.mockResolvedValue({
            faction: { id: 1, name: 'Семья Корлеоне' },
            member: { rank: 1 },
        });
        factionService.getMembers.mockResolvedValue([{ account_id: 1 }, { account_id: 2 }]);
        const member1 = makePlayer(1, 'A');
        const member2 = makePlayer(2, 'B');
        const outsider = makePlayer(3, 'C');
        global.mp.players.toArray.mockReturnValue([member1, member2, outsider]);

        await run(member1, ['сбор', 'у', 'базы']);

        const line = expect.stringContaining('[Семья] A: сбор у базы');
        expect(member1.outputChatBox).toHaveBeenCalledWith(line);
        expect(member2.outputChatBox).toHaveBeenCalledWith(line);
        expect(outsider.outputChatBox).not.toHaveBeenCalled();
    });
});
