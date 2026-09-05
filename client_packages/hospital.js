require('./ui');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const interactions = globalThis.interactions;

/**
 * Больница: подсказка E, открытие окна.
 */

mp.events.add('client:hospital:heal', () => {
    mp.events.callRemote('server:hospital:heal');
});

mp.events.add('client:hospital:result', (success, message) => {
    mp.gui.chat.push(
        success ? `!{#00FF00}[Больница] ${message}` : `!{#FF3333}[Больница] ${message}`
    );
});

interactions.register({
    radius: 3,
    getPositions: () => [state.positions.hospital],
    getHint: () => 'Больница',
    onInteract: () => {
        ui.call('toggleWindow', 'hospital');
    },
});
