/**
 * Синхронизация тюнинга транспорта между клиентами.
 */

function applyColor(entity, rgb) {
    entity.setCustomPrimaryColour(Number(rgb.r), Number(rgb.g), Number(rgb.b));
    entity.setCustomSecondaryColour(Number(rgb.r), Number(rgb.g), Number(rgb.b));
}

function applyWheels(entity, wheels) {
    entity.setWheelType(Number(wheels.type));
    entity.setMod(23, Number(wheels.id));
}

mp.events.addDataHandler('customColor', (entity, value) => {
    // триггеры тюнинга
    if (mp.vehicles.exists(entity) && value) applyColor(entity, value);
});

mp.events.addDataHandler('customWheels', (entity, value) => {
    if (mp.vehicles.exists(entity) && value) applyWheels(entity, value);
});

mp.events.addDataHandler(/^customMod_(\d+)$/, (entity, value) => {
    if (mp.vehicles.exists(entity) && value !== undefined && value !== null) {
        const modType = Number(entity.activeDataHandlerKey.split('_')[1]);
        entity.setMod(modType, Number(value));
    }
});

mp.events.add('entityStreamIn', (entity) => {
    // синхронизация стрима
    if (entity.type !== 'vehicle') return;

    const rgb = entity.getVariable('customColor');
    if (rgb) applyColor(entity, rgb);

    const wheels = entity.getVariable('customWheels');
    if (wheels && wheels.id !== undefined) applyWheels(entity, wheels);

    const technicalMods = [11, 12, 13, 18];
    technicalMods.forEach((modType) => {
        const modValue = entity.getVariable(`customMod_${modType}`);
        if (modValue !== undefined && modValue !== null && modValue !== -1)
            entity.setMod(modType, Number(modValue));
    });
});
