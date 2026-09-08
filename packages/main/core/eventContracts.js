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
};

function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function matchesSignature(args, signature) {
    if (args.length !== signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
        if (signature[i] === 'any') continue;
        if (typeOf(args[i]) !== signature[i]) return false;
    }
    return true;
}

function validateEvent(eventName, args) {
    const contract = contracts[eventName];
    if (!contract) return true; // нет контракта - пропускаем

    const signatures = Array.isArray(contract[0]) ? contract : [contract];
    for (const sig of signatures) {
        if (matchesSignature(args, sig)) return true;
    }
    console.warn(
        `[EventContract] ${eventName}: аргументы не подошли ни под одну сигнатуру: ${JSON.stringify(args)}`
    );
    return false;
}

module.exports = { contracts, validateEvent };
