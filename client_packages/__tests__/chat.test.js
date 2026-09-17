require('../state');
require('../chat');
const state = globalThis.UIState;
describe('chat: мосты', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.isChatOpen = false;
        state.globalKeyBlock = false;
        state.isAnyUiWindowOpen = false;
        state.uiBrowser = { execute: jest.fn() };
    });
    test('message: распарсен и ушёл в Vue', () => {
        mp.events.__trigger(
            'client:chat:message',
            JSON.stringify({ channel: 'global', senderName: 'A', text: 'привет' })
        );
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(expect.stringContaining('chatPush('));
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('"channel":"global"')
        );
    });
    test('битый json: мост не падает', () => {
        mp.events.__trigger('client:chat:message', '{broken');
        expect(state.uiBrowser.execute).not.toHaveBeenCalled();
    });
    test('state: каналы ушли в Vue', () => {
        mp.events.__trigger('client:chat:state', JSON.stringify(['global', 'family']));
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('chatSetChannels(')
        );
    });
    test('openState true: клавиши заблокированы, курсор показан', () => {
        mp.events.__trigger('client:chat:openState', true);
        expect(state.isChatOpen).toBe(true);
        expect(state.globalKeyBlock).toBe(true);
        expect(mp.gui.cursor.show).toHaveBeenCalledWith(true, true);
    });
    test('openState false: блоки сняты, курсор скрыт', () => {
        mp.events.__trigger('client:chat:openState', true);
        mp.events.__trigger('client:chat:openState', false);
        expect(state.isChatOpen).toBe(false);
        expect(state.globalKeyBlock).toBe(false);
        expect(mp.gui.cursor.show).toHaveBeenLastCalledWith(false, false);
    });
    test('openState false при открытом окне: курсор остаётся', () => {
        state.isAnyUiWindowOpen = true;
        mp.events.__trigger('client:chat:openState', true);
        mp.events.__trigger('client:chat:openState', false);
        expect(mp.gui.cursor.show).toHaveBeenLastCalledWith(true, true);
    });
    test('send: ушёл на сервер', () => {
        mp.events.__trigger('client:chat:send', 'family', 'сбор');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:chat:send', 'family', 'сбор');
    });
    test('requestState: запрос на сервер', () => {
        mp.events.__trigger('client:chat:requestState');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:chat:requestState');
    });
});
