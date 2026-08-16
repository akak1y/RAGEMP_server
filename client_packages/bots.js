/**
 * Боты: запоминание ped'ов и отключение их реакции на события мира.
 */

const botPeds = [];

mp.events.add('client:bot:setup', (pedId, heading) => {
    if (!botPeds.some(b => b.id === pedId)) botPeds.push({ id: pedId, heading });
});

setInterval(() => {
    botPeds.forEach(b => {
        try {
            const ped = mp.peds.atRemoteId(b.id);
            if (!ped || !ped.handle) return;
            if (typeof mp.game.ped.setBlockingOfNonTemporaryEvents === 'function') mp.game.ped.setBlockingOfNonTemporaryEvents(ped.handle, true);
        } catch (e) {}
    });
}, 3000);