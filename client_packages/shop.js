require('./interactions');

const state = globalThis.UIState;
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
    if (!state.uiBrowser) return;
    state.uiBrowser.execute(`
        if(window.setShopConfig) window.setShopConfig(${configJson});
        if(window.toggleWindow) window.toggleWindow('shop');
    `);
});

mp.events.add('client:shop:buyResult', (success, message) => {
    if (!state.uiBrowser) return;
    state.uiBrowser.execute(`
        if(window.showShopResult) window.showShopResult(${success}, "${message}");
    `);
});

mp.events.add('client:server:shopBuy', (itemId, amount) => {
    mp.events.callRemote('server:shop:buy', itemId, amount);
});

// --- зоны магазинов ---

// метка покупок
interactions.register({
    getPositions: () => [state.positions.shop],
    onInteract: () => mp.events.callRemote('server:shop:requestConfig'),
});
