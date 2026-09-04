require('./ui');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const interactions = globalThis.interactions;

let factionBlip = null;
let factionMarker = null;
let factionLabel = null;

/**
 * Фракции: данные для UI, зона базы и маркеры.
 */

mp.events.add('client:faction:setInfo', (json) => {
    try {
        state.factionInfo = JSON.parse(json);
    } catch (e) {
        state.factionInfo = null;
    }
    ui.call('setFactionInfo', state.factionInfo);
    if (state.factionInfo) {
        // временно ответ в чат
        const f = state.factionInfo;
        mp.gui.chat.push(
            `!{#4CAF50}[${f.faction.name}] Касса: $${f.faction.treasury} | Твой ранг: ${f.me.rankName} (${f.me.rank}) | В семье: ${f.members.length}`
        );
    }
});

mp.events.add('client:faction:moneyResult', (success, errorOrKind) => {
    mp.gui.chat.push(
        success
            ? '!{#4CAF50}[Фракция] Операция с кассой выполнена.'
            : `!{#FF3333}[Фракция] Ошибка: ${errorOrKind}`
    );
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
    getHint: () => 'Фракция',
    onInteract: () => mp.events.callRemote('server:faction:requestInfo'),
});
