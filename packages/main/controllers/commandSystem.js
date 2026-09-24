const isLoggedIn = require('../middleware/isLoggedIn');
const withGuards = require('../middleware/withGuards');
const logger = require('../core/logger');

const commands = new Map();

/**
 * Регистрация команды
 * @param {string} name - Имя без слэша
 * @param {{guards: Array<Function>, run: Function, description?: string}} def
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
    try {
        await cmd.run(player, args);
    } catch (err) {
        logger.error(`[Command] /${cmdName} упала: ${err.message}`);
        player.outputChatBox('!{#FF3333}[Ошибка] Команда завершилась сбоем, смотри лог сервера.');
    }
    return true;
}

/**
 * Команды, доступные игроку по правам (для /help).
 * @param {mp.Player} player
 * @returns {Array<{name: string, description: string}>}
 */
function visibleCommands(player) {
    const out = [];
    for (const [name, def] of commands) {
        let ok = true;
        for (const guard of def.guards || []) {
            let res;
            try {
                res = guard(player);
            } catch {
                ok = false;
                break;
            }
            if (res && typeof res.then === 'function') continue;
            if (!res) {
                ok = false;
                break;
            }
        }
        if (ok) out.push({ name, description: def.description || '' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
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

module.exports = { registerCommand, dispatchCommand, visibleCommands };
