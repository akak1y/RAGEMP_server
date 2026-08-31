require('./ui');
require('./natives');

const state = globalThis.UIState;
const ui = globalThis.ui;
const natives = globalThis.natives;

/**
 * Движок взаимодействий мира: клавиша E + подсказки.
 */

if (!globalThis.interactions) {
    const zones = [];

    /**
     * @param {Object} zone
     * @param {number}  [zone.radius=2.5]
     * @param {Function} zone.getPositions — массив позиций
     * @param {Function} [zone.getHint] — текст подсказки или null
     * @param {Function} zone.onInteract — (index)
     */
    function register(zone) {
        zones.push(zone);
    }

    function findNearZone() {
        const playerPos = mp.players.local.position;
        for (const zone of zones) {
            let positions;
            try {
                positions = zone.getPositions();
            } catch (e) {
                continue;
            }
            if (!Array.isArray(positions)) continue;

            for (let i = 0; i < positions.length; i++) {
                const pos = positions[i];
                if (!pos || typeof pos.x !== 'number') continue;
                const distance = natives.getDistanceBetweenCoords(playerPos, pos);
                if (distance <= (zone.radius || 2.5)) return { zone, index: i };
            }
        }
        return null;
    }

    // E — взаимодействие
    mp.keys.bind(0x45, true, () => {
        if (!state.isAuthorized || state.globalKeyBlock || state.isAnyUiWindowOpen) return;
        const hit = findNearZone();
        if (hit) hit.zone.onInteract(hit.index);
    });

    // подсказки: показ/смена/скрытие
    let currentHint = null;
    setInterval(() => {
        if (!state.isAuthorized) return;
        const hit = findNearZone();
        const text = hit && hit.zone.getHint ? hit.zone.getHint(hit.index) : null;
        if (text !== currentHint) {
            currentHint = text;
            if (text) ui.call('showInteractHint', text);
            else ui.call('hideInteractHint');
        }
    }, 500);

    globalThis.interactions = { register };
}
