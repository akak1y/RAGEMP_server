require('./ui');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const interactions = globalThis.interactions;
const notify = (text) => globalThis.chat && globalThis.chat.notify(text);

/**
 * Больница: подсказка E, открытие окна.
 */

mp.events.add('client:hospital:heal', () => {
    mp.events.callRemote('server:hospital:heal');
});

mp.events.add('client:hospital:result', (success, message) => {
    notify(String(success ? `!{#00FF00}${message}` : `!{#FF3333}${message}`));
});

// зона больницы

interactions.register({
    mode: 'foot',
    radius: 3,
    getPositions: () => [state.positions.hospital],
    getHint: () => state.interactionHints.hospital,
    onInteract: () => {
        ui.call('toggleWindow', 'hospital');
    },
});
