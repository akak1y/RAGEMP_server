require('../state');
require('../chat');
const state = globalThis.UIState;
describe('chat: мосты', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.isChatOpen = false;
        state.globalKeyBlock = false;
        state.uiBrowser = { execute: jest.fn() };
    });
    test('chat:message → chatPush в Vue', () => {
        mp.events.__trigger('client:chat:message', '{"channel":"global","text":"привет"}');
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(expect.stringContaining('chatPush('));
    });
    test('chat:state → chatSetChannels', () => {
        mp.events.__trigger('client:chat:state', '["global","family"]');
        expect(state.uiBrowser.execute).toHaveBeenCalledWith(
            expect.stringContaining('chatSetChannels(')
        );
    });
    test('openState true: браузер активен, ключи заблокированы', () => {
        mp.events.__trigger('client:chat:openState', true);
        expect(state.isChatOpen).toBe(true);
        expect(state.globalKeyBlock).toBe(true);
        expect(state.uiBrowser.active).toBe(true);
    });
    test('openState false: всё снято', () => {
        mp.events.__trigger('client:chat:openState', true);
        mp.events.__trigger('client:chat:openState', false);
        expect(state.isChatOpen).toBe(false);
        expect(state.globalKeyBlock).toBe(false);
        expect(state.uiBrowser.active).toBe(false);
    });
    test('chat:send уходит на сервер', () => {
        mp.events.__trigger('client:chat:send', 'family', 'сбор');
        expect(mp.events.callRemote).toHaveBeenCalledWith('server:chat:send', 'family', 'сбор');
    });
    test('битый json не роняет мост', () => {
        mp.events.__trigger('client:chat:message', '{oops');
        expect(state.uiBrowser.execute).not.toHaveBeenCalled();
    });
});
