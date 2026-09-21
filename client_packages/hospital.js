require('./ui');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const interactions = globalThis.interactions;
const pushSystem = (text) => globalThis.chat && globalThis.chat.pushSystem(text);

/**
 * Больница: подсказка E, открытие окна.
 */

mp.events.add('client:hospital:heal', () => {
    mp.events.callRemote('server:hospital:heal');
});

mp.events.add('client:hospital:result', (success, message) => {
    pushSystem(success ? `!{#00FF00}[Больница] ${message}` : `!{#FF3333}[Больница] ${message}`);
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
