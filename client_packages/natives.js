/**
 * Обёртки над нативками: курсор, радар, машина, контролы, педы.
 */

function showCursor(toggle) {
    try {
        mp.gui.cursor.show(toggle, toggle);
        return true;
    } catch (e) {
        return false;
    }
}

function setRadar(visible) {
    try {
        mp.game.ui.displayRadar(visible);
        return true;
    } catch (e) {
        return false;
    }
}

function freezeVehicle(veh, freeze) {
    try {
        veh.freezePosition(freeze);
        veh.setCollision(!freeze, !freeze);
        return true;
    } catch (e) {
        return false;
    }
}

function setBlockingOfNonTemporaryEvents(ped, toggle) {
    try {
        if (typeof mp.game.ped.setBlockingOfNonTemporaryEvents === 'function') {
            mp.game.ped.setBlockingOfNonTemporaryEvents(
                ped.handle !== undefined ? ped.handle : ped,
                toggle
            );
        }
        return true;
    } catch (e) {
        return false;
    }
}

// A/D, W/S, shift, space, мышь X/Y, лкм
const MOVEMENT_CONTROLS = [30, 31, 21, 22, 1, 2, 24];

function disableMovementControls() {
    try {
        for (const id of MOVEMENT_CONTROLS) {
            mp.game.controls.disableControlAction(0, id, true);
        }
        return true;
    } catch (e) {
        return false;
    }
}

function enableMouseControls() {
    try {
        mp.game.controls.enableControlAction(0, 1, true);
        mp.game.controls.enableControlAction(0, 2, true);
        return true;
    } catch (e) {
        return false;
    }
}

function disableAllControls() {
    try {
        mp.game.controls.disableAllControlActions(0);
        return true;
    } catch (e) {
        return false;
    }
}

globalThis.natives = {
    showCursor,
    setRadar,
    freezeVehicle,
    setBlockingOfNonTemporaryEvents,
    disableMovementControls,
    enableMouseControls,
    disableAllControls,
};
