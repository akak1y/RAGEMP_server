const state = globalThis.UIState;

/** Выполнить код в CEF-браузере, если он есть */
function callUi(code) {
    if (state.uiBrowser) state.uiBrowser.execute(code);
}

function updateMiningProgress(pct) {
    callUi(`if(window.updateMiningProgress) window.updateMiningProgress(${pct.toFixed(1)});`);
}
function hideMiningProgress() {
    callUi(`if(window.hideMiningProgress) window.hideMiningProgress();`);
}
function showInteractHint(text) {
    callUi(`if(window.showInteractHint) window.showInteractHint(${JSON.stringify(text)});`);
}
function hideInteractHint() {
    callUi(`if(window.hideInteractHint) window.hideInteractHint();`);
}

module.exports = { callUi, updateMiningProgress, hideMiningProgress, showInteractHint, hideInteractHint };