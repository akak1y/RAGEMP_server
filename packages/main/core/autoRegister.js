const fs = require('fs');
const path = require('path');

/**
 * Автоматическая загрузка всех JS-файлов из директории.
 * Если экспортируется функция getModel(), вызывает её.
 */
function registerAll(dir, options = {}) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

    files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const mod = require(fullPath);

        if (options.callGetModel && typeof mod.getModel === 'function') {
            mod.getModel();
        }
    });
    return files.length;
}

module.exports = { registerAll };
