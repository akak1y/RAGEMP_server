require('./ui');
require('./natives');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;
const interactions = globalThis.interactions;

let factionBlip = null;

/**
 * Фракции: данные для UI, зона базы.
 */

mp.events.add('client:faction:setInfo', (json) => {
    try {
        state.factionInfo = JSON.parse(json);
    } catch (e) {
        state.factionInfo = null;
    }
    ui.call('setFactionInfo', state.factionInfo);
});

mp.events.add('client:faction:moneyResult', (success, errorOrKind) => {
    mp.gui.chat.push(
        success
            ? '!{#4CAF50}[Фракция] Операция с кассой выполнена.'
            : `!{#FF3333}[Фракция] Ошибка: ${errorOrKind}`
    );
});

// зона базы мафии
interactions.register({
    radius: 3,
    getPositions: () => [state.positions.mafiaBase],
    getHint: () => 'Фракция',
    onInteract: () => mp.events.callRemote('server:faction:requestInfo'),
});
