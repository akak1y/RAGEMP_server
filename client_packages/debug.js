const state = globalThis.UIState;

/**
 * Дебаг-инструменты: лог в F5-окно
 */

function log(...args) {
    try {
        const msg = args
            .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
            .join(' ');
        state.uiBrowser.execute(
            `if(window.addDebugLog) window.addDebugLog(${JSON.stringify(msg)});`
        );
    } catch (e) {}
}

mp.events.add('client:account:hideAuth', () => {
    setTimeout(() => {
        log('=== POST-AUTH DUMP ===');
        log('isAuthorized:', state.isAuthorized);
        log('positions:', state.positions);
    }, 2500);
});

globalThis.debug = { log };
