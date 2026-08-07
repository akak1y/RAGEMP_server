/**
 * Middleware: проверка уровня администратора
 * 
 * @param {number} [minLevel=1] - Минимальный уровень админа
 * @returns {Function} middleware (player) => boolean
 */
function isAdmin(minLevel = 1) {
    return (player) => {
        return !!(
            player &&
            player.isLoggedIn &&
            Number.isInteger(player.adminLevel) &&
            player.adminLevel >= minLevel
        );
    };
}

module.exports = isAdmin