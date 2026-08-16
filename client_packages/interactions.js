const state = globalThis.UIState;

/**
 * Взаимодействие с маркерами мира (клавиша E).
 */

mp.keys.bind(0x45, true, () => { // E - взаимодействие с маркером
    if (!state.isAuthorized || state.globalKeyBlock || state.isAnyUiWindowOpen || !state.positions.dealership || !state.positions.garage || !state.positions.carCustom) return;

    const playerPos = mp.players.local.position;
    const interactionRadius = 2.5;

    const interactionZones = [ // конфигурация зон
        {
            name: 'dealership',
            position: state.positions.dealership,
            onInteract: () => {
                mp.events.callRemote('server:dealership:requestConfig');
                if (state.uiBrowser) state.uiBrowser.execute(`if(window.toggleWindow) window.toggleWindow('dealership');`);
            }
        },
        {
            name: 'garage',
            position: state.positions.garage,
            onInteract: () => {
                mp.events.callRemote('server:phone:requestCars');
                if (state.uiBrowser) {
                    state.uiBrowser.execute(`
                        if(window.setPayDeliveryCar) window.setPayDeliveryCar(false);
                        if(window.toggleWindow) window.toggleWindow('phone');
                    `)
                }
            }
        },
        {
            name: 'customCar',
            position: state.positions.carCustom,
            onInteract: () => {
                mp.events.callRemote('server:customCar:enterTuning'); // входим в LSC
            }
        },
        {
            name: 'fuel',
            position: state.positions.fuel,
            onInteract: () => {
                const veh = mp.players.local.vehicle;
                if (!veh) return mp.gui.chat.push('!{#FF3333}[Заправка] Сначала сядьте в машину.');
                const dbId = veh.getVariable('dbId');
                if (!dbId) return mp.gui.chat.push('!{#FF3333}[Заправка] Это не ваша машина.');
                mp.events.callRemote('server:fuel:refuel', dbId)
            }
        },
        {
            name: 'courierStart',
            position: state.positions.courierStart,
            onInteract: () => { mp.events.callRemote('server:courier:interact'); }
        },
        {
            name: 'courierTarget',
            position: state.positions.courierTarget,
            onInteract: () => { mp.events.callRemote('server:courier:interact'); }
        },
    ];
    for (const zone of interactionZones) { // проверяем каждую зону
        if (!zone.position) continue;
        const distance = mp.game.gameplay.getDistanceBetweenCoords( playerPos.x, playerPos.y, playerPos.z, zone.position.x, zone.position.y, zone.position.z, true );
        if (distance <= interactionRadius) {
            zone.onInteract();
            break
        }
    }
});