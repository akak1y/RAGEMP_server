const { initDB } = require('../../core/db');
const moneyService = require('../../services/MoneyService');
const { getUserModel } = require('../../models/Users');
const accountService = require('../../services/AccountService');

let sequelize;

beforeAll(async () => {
    sequelize = await initDB();
    accountService.initialize();
});

afterAll(async () => {
    await sequelize.close();
});

beforeEach(async () => {
    const User = getUserModel();
    await User.destroy({ where: {} });
});

describe('MoneyService — интеграционные тесты', () => {
    test('addMoney: успешное зачисление', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'test1', password: 'x', money: 100 });

        const success = await moneyService.addMoney(user.id, 50, 'тест');
        expect(success).toBe(true);
        
        const updated = await User.findByPk(user.id);
        expect(updated.money).toBe(150);
    });

    test('takeMoney: атомарность — БД не даёт уйти в минус', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'test2', password: 'x', money: 100 });

        const success = await moneyService.takeMoney(user.id, 150, 'тест');
        expect(success).toBe(false);

        const updated = await User.findByPk(user.id);
        expect(updated.money).toBe(100);
    });

    test('takeMoney: успешное списание', async () => {
        const User = getUserModel();
        const user = await User.create({ username: 'test3', password: 'x', money: 200 });

        const success = await moneyService.takeMoney(user.id, 50, 'тест');
        expect(success).toBe(true);

        const updated = await User.findByPk(user.id);
        expect(updated.money).toBe(150);
    });
});