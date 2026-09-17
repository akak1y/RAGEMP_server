jest.mock('../core/eventSender', () => ({ sendEvent: jest.fn() }));
jest.mock('../services/FactionService', () => ({
    getMembership: jest.fn(),
    getMembers: jest.fn(),
}));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
global.mp = { players: { toArray: jest.fn(() => []) } };
const chatService = require('../services/ChatService');
const { sendEvent } = require('../core/eventSender');
const factionService = require('../services/FactionService');

const makePlayer = (id, name, adminLevel = 0) => ({
    accountId: id,
    accountName: name,
    adminLevel,
    isLoggedIn: true,
});
const sentTo = (player) =>
    sendEvent.mock.calls.filter((c) => c[0] === player).map((c) => JSON.parse(c[2][0]));

describe('ChatService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        factionService.getMembership.mockResolvedValue(null);
        global.mp.players.toArray.mockReturnValue([]);
    });
    test('global: получают все залогиненные', async () => {
        const p1 = makePlayer(1, 'A');
        const p2 = makePlayer(2, 'B');
        const guest = { accountId: null, isLoggedIn: false };
        global.mp.players.toArray.mockReturnValue([p1, p2, guest]);
        const res = await chatService.send(p1, 'global', 'всем привет');
        expect(res).toEqual({ success: true });
        expect(sentTo(p1)[0]).toMatchObject({
            channel: 'global',
            senderName: 'A',
            text: 'всем привет',
        });
        expect(sentTo(p2)).toHaveLength(1);
        expect(sendEvent.mock.calls.filter((c) => c[0] === guest)).toHaveLength(0);
    });
    test('неизвестный канал падает в global', async () => {
        const p1 = makePlayer(1, 'A');
        global.mp.players.toArray.mockReturnValue([p1]);
        await chatService.send(p1, 'nope', 'текст');
        expect(sentTo(p1)[0]).toMatchObject({ channel: 'global' });
    });
    test('family: не член семьи — отказ без рассылки', async () => {
        const p1 = makePlayer(1, 'A');
        global.mp.players.toArray.mockReturnValue([p1]);
        const res = await chatService.send(p1, 'family', 'сбор');
        expect(res).toEqual({ success: false, error: 'not_member' });
        expect(sentTo(p1)[0]).toMatchObject({ channel: 'system' });
    });
    test('family: получают только члены семьи', async () => {
        const p1 = makePlayer(1, 'A');
        const p2 = makePlayer(2, 'B');
        const p3 = makePlayer(3, 'C', 1);
        global.mp.players.toArray.mockReturnValue([p1, p2, p3]);
        factionService.getMembership.mockResolvedValue({
            faction: { id: 7 },
            member: { rank: 1 },
        });
        factionService.getMembers.mockResolvedValue([{ account_id: 1 }, { account_id: 2 }]);
        const res = await chatService.send(p1, 'family', 'сбор у базы');
        expect(res).toEqual({ success: true });
        expect(sentTo(p2)[0]).toMatchObject({ channel: 'family', text: 'сбор у базы' });
        expect(sendEvent.mock.calls.filter((c) => c[0] === p3)).toHaveLength(0);
    });
    test('admin: без прав — отказ', async () => {
        const p1 = makePlayer(1, 'A');
        global.mp.players.toArray.mockReturnValue([p1]);
        const res = await chatService.send(p1, 'admin', 'репорт');
        expect(res).toEqual({ success: false, error: 'no_permission' });
    });
    test('admin: получают только админы', async () => {
        const p1 = makePlayer(1, 'A', 1);
        const p2 = makePlayer(2, 'B');
        global.mp.players.toArray.mockReturnValue([p1, p2]);
        await chatService.send(p1, 'admin', 'репорт');
        expect(sentTo(p1)[0]).toMatchObject({ channel: 'admin' });
        expect(sendEvent.mock.calls.filter((c) => c[0] === p2)).toHaveLength(0);
    });
    test('пустой текст — без рассылки', async () => {
        const p1 = makePlayer(1, 'A');
        const res = await chatService.send(p1, 'global', '   ');
        expect(res).toEqual({ success: false, error: 'empty' });
        expect(sendEvent).not.toHaveBeenCalled();
    });
    test('channelsFor: набор по правам', async () => {
        const plain = makePlayer(1, 'A');
        expect(await chatService.channelsFor(plain)).toEqual(['global']);
        const admin = makePlayer(2, 'B', 1);
        expect(await chatService.channelsFor(admin)).toEqual(['global', 'admin']);
        factionService.getMembership.mockResolvedValue({
            faction: { id: 1 },
            member: { rank: 0 },
        });
        expect(await chatService.channelsFor(plain)).toEqual(['global', 'family']);
    });
    test('pushSystem: системный канал с null-отправителем', () => {
        const p1 = makePlayer(1, 'A');
        chatService.pushSystem(p1, '!{#FF3333}ошибка');
        expect(sentTo(p1)[0]).toMatchObject({
            channel: 'system',
            text: '!{#FF3333}ошибка',
            senderId: null,
        });
    });
});
