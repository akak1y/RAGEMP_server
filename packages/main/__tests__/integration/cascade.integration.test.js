const { initDB } = require('../../core/db');
const { getUserModel } = require('../../models/Users');
const { getItemModel } = require('../../models/Item');
const { getVehicleModel } = require('../../models/Vehicle');

let sequelize;

beforeAll(async () => {
    sequelize = await initDB();
});

afterAll(async () => {
    await sequelize.close();
});

beforeEach(async () => {
    const User = getUserModel();
    await User.destroy({ where: {} });
});

describe('ON DELETE CASCADE — интеграционные тесты', () => {
    test('удаление аккаунта удаляет его предметы', async () => {
        const User = getUserModel();
        const Item = getItemModel();

        const user = await User.create({ username: 'cascade1', password: 'x', money: 100 });
        await Item.create({
            owner_id: user.id,
            item_id: 'burger',
            count: 5,
            slot: 1,
        });

        await User.destroy({ where: { id: user.id } });

        const items = await Item.findAll({ where: { owner_id: user.id } });
        expect(items.length).toBe(0);
    });

    test('удаление аккаунта удаляет его машины', async () => {
        const User = getUserModel();
        const Vehicle = getVehicleModel();

        const user = await User.create({ username: 'cascade2', password: 'x', money: 100000 });
        await Vehicle.create({ owner_id: user.id, model: 'adder', fuel: 100 });

        await User.destroy({ where: { id: user.id } });

        const vehicles = await Vehicle.findAll({ where: { owner_id: user.id } });
        expect(vehicles.length).toBe(0);
    });
});
