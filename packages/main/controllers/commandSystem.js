const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');

const commands = new Map();

/**
 * Регистрация команды
 * @param {string} name - Имя без слэша
 * @param {{guards: Array<Function>, run: Function}} def
 */
function registerCommand(name, def) {
    commands.set(name, def)
}

mp.events.add('playerCommand', withGuards([isLoggedIn], async (player, command) => {
    const args = command.split(/[ ]+/);
    const cmdName = args.shift().toLowerCase();
    const cmd = commands.get(cmdName);
    if (!cmd) return;
    for (const guard of cmd.guards) {
        if (!guard(player)) return player.outputChatBox("!{#FF3333}[Ошибка] Недостаточно прав для этой команды.");
    }
    await cmd.run(player, args);
}, 'playerCommand'));

module.exports = { registerCommand }