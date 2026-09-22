'use strict';

/**
 * Ключевой async-мьютекс: сериализует read-modify-write секции на одну сущность (игрок, фракция, камень), разные сущности идут параллельно.
 */

const queues = new Map(); // key → хвост очереди

/**
 * Выполнить fn, удерживая лок на key.
 * @param {string|number} key - идентификатор сущности
 * @param {Function} fn
 * @returns {Promise<*>} результат fn
 */
function withLock(key, fn) {
    const prev = queues.get(key) || Promise.resolve();
    const current = prev.then(fn);
    const tail = current.then(
        () => cleanup(key, tail),
        () => cleanup(key, tail)
    );
    queues.set(key, tail);
    return current;
}

/**
 * Убрать запись из Map, если хвост ещё актуален
 * @private
 */
function cleanup(key, tail) {
    if (queues.get(key) === tail) queues.delete(key);
}

module.exports = { withLock };
