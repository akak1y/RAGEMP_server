const state = globalThis.UIState;
const ui = globalThis.ui;
const interactions = globalThis.interactions;

let factionBlip = null;
let factionMarker = null;
let factionLabel = null;

/**
 * Фракции: данные для UI, зона базы, маркеры, пересылки управления составом.
 */

mp.events.add('client:faction:setInfo', (json) => {
    try {
        state.factionInfo = JSON.parse(json);
    } catch (e) {
        state.factionInfo = null;
    }
    ui.call('setFactionInfo', state.factionInfo);
});

mp.events.add('client:faction:open', () => {
    ui.call('toggleWindow', 'faction');
});

mp.events.add('client:faction:moneyResult', (success, errorOrKind) => {
    mp.gui.chat.push(
        success
            ? '!{#4CAF50}[Фракция] Операция с кассой выполнена.'
            : `!{#FF3333}[Фракция] Ошибка: ${errorOrKind}`
    );
});

mp.events.add('client:faction:memberResult', (success, message) => {
    mp.gui.chat.push(success ? `!{#4CAF50}[Семья] ${message}` : `!{#FF3333}[Семья] ${message}`);
});

// VUE → СЕРВЕР: управление составом
mp.events.add('client:faction:invite', (name) => {
    mp.events.callRemote('server:faction:invite', String(name));
});

mp.events.add('client:faction:kick', (id) => {
    mp.events.callRemote('server:faction:kick', Number(id));
});

mp.events.add('client:faction:promote', (id) => {
    mp.events.callRemote('server:faction:promote', Number(id));
});

mp.events.add('client:faction:demote', (id) => {
    mp.events.callRemote('server:faction:demote', Number(id));
});

mp.events.add('client:faction:deposit', (sum) => {
    mp.events.callRemote('server:faction:deposit', Number(sum));
});

mp.events.add('client:faction:withdraw', (sum) => {
    mp.events.callRemote('server:faction:withdraw', Number(sum));
});

mp.events.add('client:locations:setAll', (json) => {
    try {
        const data = JSON.parse(json);
        if (!data.mafiaBase || factionBlip) return;
        const { x, y, z } = data.mafiaBase;

        factionBlip = mp.blips.new(303, new mp.Vector3(x, y, z), {
            color: 1,
            shortRange: false,
            name: 'Мафия',
            scale: 0.8,
        });

        factionMarker = mp.markers.new(1, new mp.Vector3(x, y, z - 1.0), 2.0, {
            color: [211, 20, 20, 120],
            visible: true,
            dimension: 0,
        });

        factionLabel = mp.labels.new('МАФИЯ', new mp.Vector3(x, y, z), {
            color: [200, 0, 0, 255],
            font: 4,
            drawDistance: 40,
            dimension: 0,
        });
    } catch (e) {}
});

// зона базы мафии
interactions.register({
    radius: 3,
    getPositions: () => [state.positions.mafiaBase],
    getHint: () => state.interactionHints.mafiaBase || null,
    onInteract: () => mp.events.callRemote('server:faction:open'),
});
