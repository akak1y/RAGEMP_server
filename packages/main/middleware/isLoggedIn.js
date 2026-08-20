/**
 * Middleware: проверка авторизации игрока
 *
 * @param {mp.Player} player - Игрок
 * @returns {boolean} true, если игрок авторизован
 */
function isLoggedIn(player) {
    return !!(player && player.isLoggedIn);
}

module.exports = isLoggedIn;
