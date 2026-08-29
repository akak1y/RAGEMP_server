const state = globalThis.UIState;

/**
 * UI-мост: клиент → Vue (CEF).
 */

function callUi(code) {
    if (state.uiBrowser) state.uiBrowser.execute(code);
}

function call(fn, ...args) {
    const serialized = args.map((a) => JSON.stringify(a)).join(',');
    callUi(`if(window.${fn}) window.${fn}(${serialized});`);
}

function toggleWindow(name) {
    callUi(`if(window.toggleWindow) window.toggleWindow('${name}');`);
}

globalThis.ui = { callUi, call, toggleWindow };
