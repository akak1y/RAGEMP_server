/**
 * Доменный модуль банка.
 */
const state = globalThis.UIState;
const ui = globalThis.ui;

// VUE → СЕРВЕР
mp.events.add('client:bank:open', () => {
    mp.events.callRemote('server:bank:open');
});
mp.events.add('client:bank:deposit', (amount) => {
    mp.events.callRemote('server:bank:deposit', amount);
});
mp.events.add('client:bank:withdraw', (amount) => {
    mp.events.callRemote('server:bank:withdraw', amount);
});
mp.events.add('client:bank:transfer', (toAccountId, amount) => {
    mp.events.callRemote('server:bank:transfer', toAccountId, amount);
});
mp.events.add('client:bank:requestLedger', (limit) => {
    mp.events.callRemote('server:bank:requestLedger', limit);
});
mp.events.add('client:bank:requestInfo', () => {
    mp.events.callRemote('server:bank:requestInfo');
});

// зона банка

interactions.register({
    mode: 'foot',
    getPositions: () => [state.positions.bank],
    getHint: () => state.interactionHints.bank,
    onInteract: () => {
        ui.call('toggleWindow', 'bank');
    },
});
