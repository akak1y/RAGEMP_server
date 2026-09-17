require('./ui');
require('./natives');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;

/**
 * Чат: мосты CEF - игра. Встроенный чат не используется вообще.
 */
mp.events.add('client:chat:message', (json) => {
    try {
        ui.call('chatPush', JSON.parse(json));
    } catch (e) {}
});

mp.events.add('client:chat:state', (json) => {
    try {
        ui.call('chatSetChannels', JSON.parse(json));
    } catch (e) {}
});

// Vue сообщает об open/close enter: блокируем клавиши/движение и показываем курсор
mp.events.add('client:chat:openState', (open) => {
    state.isChatOpen = !!open;
    state.globalKeyBlock = !!open;
    natives.showCursor(!!open || state.isAnyUiWindowOpen);
});

mp.events.add('client:chat:send', (channel, text) => {
    mp.events.callRemote('server:chat:send', channel, text);
});

mp.events.add('client:chat:requestState', () => {
    mp.events.callRemote('server:chat:requestState');
});
