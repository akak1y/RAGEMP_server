/**
 * Контракты событий: типы аргументов по позициям.
 */
const contracts = {
    // ===== authController.js =====
    'client:account:authError': ['string'],
    'client:account:hideAuth': ['number'],

    // ===== moneyApi.js + authController.js =====
    'client:updateMoney': ['number'],

    // ===== gameEvents.js =====
    'client:setRedisStats': ['number'],

    // ===== adminCommands.js =====
    'client:ui:debugLog': ['string', 'string'],

    // ===== factionController.js =====
    'client:faction:setInfo': ['string'],
    'client:faction:moneyResult': ['boolean', 'string'],

    // ===== hospitalController.js =====
    'client:hospital:result': ['boolean', 'string'],

    // ===== locationController.js =====
    'client:locations:setAll': ['string'],

    // ===== miningController.js =====
    'client:mining:setData': ['string'],
    'client:mining:startChannel': ['number', 'number'],
    'client:mining:sellInfo': ['string'],
    'client:mining:sellResult': ['boolean', 'string'],

    // ===== shopController.js =====
    'client:shop:setPos': ['string'],
    'client:shop:show': ['string'],
    'client:shop:buyResult': ['boolean', 'string'],

    // ===== tuningController.js =====
    'client:customCar:setTuningConfig': ['string'],
    'client:customCar:setTuningState': ['string'],
    'client:custom:startTuning': ['number', 'number', 'number', 'number'],

    // ===== vehicleController.js =====
    'client:dealership:setConfig': ['string'],
    'client:phone:setCarList': ['string', 'string'],
    'client:phone:requestPriceDeliveryCar': ['number'],
    'client:phone:updateCars': [],

    // ===== InventoryService.js =====
    'client:inventory:update': ['string', 'string'],

    // ===== BotService.js =====
    'client:bot:setup': ['number', 'number'],

    // ===== CourierService.js =====
    'client:courier:target': [
        ['number', 'number', 'number', 'string'], // активная цель
        ['null'], // сброс цели
    ],

    // ===== factionController.js =====
    'client:faction:open': [],
    'client:faction:memberResult': ['boolean', 'string'],

    // ===== MiningService.js =====
    'client:mining:rocksUpdate': ['string'],

    // ===== factionStorageController.js =====
    'client:factionStorage:setInfo': ['string'],
    'client:factionStorage:result': ['boolean', 'string'],

    // ===== armoryController.js =====
    'client:armory:setInfo': ['string'],
    'client:armory:result': ['boolean', 'string'],

    // ===== ChatService.js / chatController.js =====
    'client:chat:message': ['string'],
    'client:chat:notify': ['string'],
    'client:chat:state': ['string'],
};

function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function matchesSignature(args, signature) {
    if (!Array.isArray(args) || !Array.isArray(signature)) return false;
    if (args.length !== signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
        if (signature[i] === 'any') continue;
        if (typeOf(args[i]) !== signature[i]) return false;
    }
    return true;
}

/**
 * Безопасное описание аргументов для лога.
 * @param {unknown} value
 * @returns {string}
 */
function safeStringify(value) {
    try {
        const json = JSON.stringify(value);
        if (json !== undefined) return json;
    } catch {
        // fallthrough
    }

    try {
        if (value === null) return 'null';
        if (Array.isArray(value)) {
            return `[${value.map((item) => safeStringify(item)).join(', ')}]`;
        }

        const t = typeof value;
        if (t === 'bigint') return `${value.toString()}n`;
        if (t === 'function') return '[Function]';
        if (t === 'symbol') return value.toString();
        if (t === 'object') {
            const ctor = value && value.constructor && value.constructor.name;
            return `[Object ${ctor || 'anonymous'}]`;
        }
        return String(value);
    } catch {
        return '[Unserializable]';
    }
}

/**
 * Краткое безопасное описание массива аргументов.
 * @param {unknown[]} args
 * @returns {string}
 */
function describeArgs(args) {
    if (!Array.isArray(args)) return safeStringify(args);

    try {
        const types = args.map((arg) => typeOf(arg)).join(', ');
        const preview = safeStringify(args);

        if (preview && preview !== '[Unserializable]') {
            return `${preview} (types: ${types})`;
        }

        return `(types: ${types})`;
    } catch {
        return '(не удалось сериализовать аргументы)';
    }
}

function validateEvent(eventName, args) {
    try {
        const contract = contracts[eventName];
        if (!contract) return true; // нет контракта - пропускаем

        const signatures = Array.isArray(contract[0]) ? contract : [contract];
        for (const sig of signatures) {
            if (matchesSignature(args, sig)) return true;
        }
        console.warn(
            `[EventContract] ${eventName}: аргументы не подошли ни под одну сигнатуру: ${describeArgs(args)}`
        );
        return false;
    } catch (err) {
        console.error(
            `[EventContract] ${eventName}: внутренняя ошибка валидации: ${err && err.message ? err.message : String(err)}`
        );
        return true;
    }
}

module.exports = { contracts, validateEvent };
