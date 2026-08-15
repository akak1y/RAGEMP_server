/**
 * Проверка дистанции между двумя точками
 * @param {Object} pos - { x, y, z }
 * @param {Object} point - { x, y, z }
 * @param {number} [radius=2.5] - Радиус проверки
 * @returns {boolean}
 */
function isNear(pos, point, radius = 2.5) {
    if (!pos || !point) return false;
    const dx = pos.x - point.x;
    const dy = pos.y - point.y;
    const dz = pos.z - point.z;
    return Math.hypot(dx, dy, dz) <= radius;
}

module.exports = { isNear };