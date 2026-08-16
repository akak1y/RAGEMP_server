require('./state'); // создаём UIstate
const state = globalThis.UIState;
require('./auth');
require('./windows');
require('./speedometer');
require('./courier');
require('./bots');
require('./tuning');
require('./vehicleSync');
require('./interactions');
require('./keys');
require('./bridges');

mp.gui.chat.show(false); // скрываем чат и миникарту
mp.game.ui.displayRadar(false);

mp.events.add("playerReady", () => { state.uiBrowser = mp.browsers.new("http://localhost:5173/") }); // подключаемся к vue сайту

mp.events.add("browserCreated", (browser) => { // когда создался браузер
    if (state.uiBrowser && browser === state.uiBrowser){
        mp.gui.cursor.show(true, true) // включаем курсор для авторизации
    }
});