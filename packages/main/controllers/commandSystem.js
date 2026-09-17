const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');

const commands = new Map();

/**
 * Регистрация команды
 * @param {string} name - Имя без слэша
 * @param {{guards: Array<Function>, run: Function}} def
 */
function registerCommand(name, def) {
    commands.set(name, def);
}

/**
 * Диспетчер командной строки (без ведущего слэша).
 * Используется и встроенным playerCommand, и кастомным CEF-чатом.
 * @param {mp.Player} player
 * @param {string} command - например "pay Ivan 500"
 * @returns {Promise<boolean>} true — команда найдена
 */
async function dispatchCommand(player, command) {
    const args = String(command ?? '')
        .split(/[ ]+/)
        .filter(Boolean);
    const cmdName = (args.shift() || '').toLowerCase();
    const cmd = commands.get(cmdName);
    if (!cmd) return false;
    for (const guard of cmd.guards) {
        if (!guard(player)) {
            player.outputChatBox('!{#FF3333}[Ошибка] Недостаточно прав для этой команды.');
            return true;
        }
    }
    await cmd.run(player, args);
    return true;
}

mp.events.add(
    'playerCommand',
    withGuards(
        [isLoggedIn],
        async (player, command) => {
            await dispatchCommand(player, command);
        },
        'playerCommand'
    )
);

module.exports = { registerCommand, dispatchCommand };
