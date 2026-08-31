require('./ui');
require('./interactions');

const state = globalThis.UIState;
const ui = globalThis.ui;
const interactions = globalThis.interactions;

/**
 * Магазин: позиция зоны, открытие окна, результат покупки.
 */

mp.events.add('client:shop:setPos', (posJson) => {
    let pos = null;
    try {
        pos = typeof posJson === 'string' ? JSON.parse(posJson) : posJson;
    } catch (e) {
        pos = null;
    }
    if (!pos || typeof pos.x !== 'number') return;
    state.positions.shop = pos;
});

mp.events.add('client:shop:show', (configJson) => {
    ui.call('setShopConfig', JSON.parse(configJson));
    ui.toggleWindow('shop');
});

mp.events.add('client:shop:buyResult', (success, message) => {
    ui.call('showShopResult', success, message);
});

mp.events.add('client:server:shopBuy', (itemId, amount) => {
    mp.events.callRemote('server:shop:buy', itemId, amount);
});

// --- зоны магазинов ---

interactions.register({
    getPositions: () => [state.positions.shop],
    onInteract: () => mp.events.callRemote('server:shop:requestConfig'),
});
