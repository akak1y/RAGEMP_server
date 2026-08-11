module.exports = {
    ItemConfig: {
        "burger": { name: "Бургер", weight: 0.2, maxStack: 5 },
        "water": { name: "Вода", weight: 0.3, maxStack: 10 },
        "phone": { name: "Смартфон iFruit", weight: 0.5, maxStack: 1 }
    },
    VehicleConfig: {
        "adder": { name: "Truffade Adder", price: 100000 },
        "turismor": { name: "Grotti Turismo R", price: 50000 },
        "faggio": { name: "Pegassi Faggio", price: 5000 },
        "oppressor2": { name: "Oppressor", price: 10000 },
        "blazer5": { name: "Blazer", price: 15000 },
        "kamacho": { name: "Canis Kamacho", price: 9000 },
        "guardian": { name: "Guardian", price: 2000 },
        "monster3": { name: "Monster3", price: 3000 },
        "pigalle": { name: "Pigalle", price: 4000 },
        "futo": { name: "Futo", price: 5000 }
    },
    PhoneConfig: {
        deliveryCar: 200
    },
    TuningConfig: {
        colorPrice: 1000, // цена покраски
        colors: [ // палитра цветов
            { name: 'Черный', value: { r: 0, g: 0, b: 0 } },
            { name: 'Белый', value: { r: 255, g: 255, b: 255 } },
            { name: 'Красный', value: { r: 200, g: 0, b: 0 } },
            { name: 'Желтый', value: { r: 255, g: 215, b: 0 } }
        ],
        performanceMods: { // технические моды
            engine: { title: 'Двигатель', modType: 11, topLevel: 3, price: 15000, currentField: 'engine_mod' },
            brakes: { title: 'Тормоза', modType: 12, topLevel: 2, price: 10000, currentField: 'brakes_mod' },
            transmission: { title: 'Коробка передач', modType: 13, topLevel: 2, price: 12000, currentField: 'transmission_mod' },
            turbo: { title: 'Турбо-наддув', modType: 18, topLevel: 0, price: 25000, currentField: 'turbo_mod' }
        },
        wheels: { // диски
            title: 'Диски',
            options: [
                { name: 'Сток', wheelType: 0, wheelId: -1, price: 100 },
                { name: 'Спортивные', wheelType: 0, wheelId: 5, price: 1000 },
                { name: 'Внедорожные', wheelType: 2, wheelId: 8, price: 2000 }
            ]
        }
    },
    DealershipPos: { x: -474.0, y: -95.0, z: 39.0 },
    GaragePos: { x: -439.2, y: -102.7, z: 40.5, h: 33.0 },
    CarCustomPos: { x: -403.5, y: -71.6, z: 44.5, h: 52.0 },
    CustomBoxPos: { x: -401.3, y: -84.2, z: 53.9, h: 298.0 },
    HospitalPos: { x: -449.6, y: -133.1, z: 39.1, h: 120.6 },
    BotSpawnPos: { x: -453.3, y: -85.1, z: 40.0, h: 215.6 },
    FuelStationPos: { x: -374.4, y: -87.4, z: 45.7 },
    FuelPricePerLiter: 3, // цена за литр
    FuelInteractionRadius: 5, // расстояние заправки
}