const state = globalThis.UIState;

/**
 * Оружие: перезарядка по бинду R.
 */
mp.keys.bind(0x52, true, () => {
    if (!state.isAuthorized || state.globalKeyBlock || state.isAnyUiWindowOpen) return;
    mp.events.callRemote('server:weapon:reload');
});

mp.events.add('client:weapon:reloadResult', (success, message) => {
    mp.gui.chat.push(success ? `!{#4CAF50}[Оружие] ${message}` : `!{#FF3333}[Оружие] ${message}`);
});
