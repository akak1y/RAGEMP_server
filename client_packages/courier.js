const state = globalThis.UIState;

/**
 * Курьер: маркер и blip точки назначения по данным сервера.
 */

let courierMarker = null;
let courierBlip = null;

mp.events.add('client:courier:target', (x, y, z, stage) => {
    if (courierMarker) { courierMarker.destroy(); courierMarker = null; }
    if (courierBlip) { courierBlip.destroy(); courierBlip = null; }
    state.positions.courierTarget = null;
    if (x === null || x === undefined) return;

    state.positions.courierTarget = new mp.Vector3(x, y, z);
    const isDelivery = stage === 'delivery';
    courierMarker = mp.markers.new(1, state.positions.courierTarget, isDelivery ? 1.0 : 2.5, {
        color: isDelivery ? [255, 200, 0, 150] : [100, 150, 255, 150]
    });
    if (isDelivery) {
        courierBlip = mp.blips.new(477, state.positions.courierTarget);
        try {
            courierBlip.shortRange = false;
            courierBlip.name = 'Доставка';
        } catch (e) {}
    }
});