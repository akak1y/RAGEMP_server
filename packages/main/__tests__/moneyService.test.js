const { Sequelize, Op } = require('sequelize');
const moneyService = require('../services/MoneyService');
const accountService = require('../services/AccountService');

jest.mock('../services/AccountService', () => ({
    getModel: jest.fn(),
    findById: jest.fn()
}));

jest.mock('../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('MoneyService', () => {
    let mockUserModel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUserModel = {
            update: jest.fn()
        };
        accountService.getModel.mockReturnValue(mockUserModel);
    });

    describe('addMoney', () => {
        test('успешно добавляет деньги', async () => {
            mockUserModel.update.mockResolvedValue([1]);
            const result = await moneyService.addMoney(1, 500, 'тест');
            expect(result).toBe(true);
            expect(mockUserModel.update).toHaveBeenCalledWith(
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 1 } }
            );
        });

        test('отклоняет отрицательную сумму', async () => {
            const result = await moneyService.addMoney(1, -100);
            expect(result).toBe(false);
            expect(mockUserModel.update).not.toHaveBeenCalled();
        });

        test('отклоняет нулевую сумму', async () => {
            const result = await moneyService.addMoney(1, 0);
            expect(result).toBe(false);
        });

        test('отклоняет дробную сумму', async () => {
            const result = await moneyService.addMoney(1, 50.5);
            expect(result).toBe(false);
        });

        test('возвращает false, если аккаунт не найден', async () => {
            mockUserModel.update.mockResolvedValue([0]);
            const result = await moneyService.addMoney(999, 500);
            expect(result).toBe(false);
        });

        test('логирует причину операции', async () => {
            mockUserModel.update.mockResolvedValue([1]);
            const logger = require('../logger');
            await moneyService.addMoney(1, 500, 'бонус');
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('бонус'));
        });
    });

    describe('takeMoney', () => {
        test('успешно списывает деньги', async () => {
            mockUserModel.update.mockResolvedValue([1]);
            const result = await moneyService.takeMoney(1, 300, 'покупка');
            expect(result).toBe(true);
            expect(mockUserModel.update).toHaveBeenCalledWith(
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 1, money: { [Op.gte]: 300 } } }
            );
        });

        test('отклоняет отрицательную сумму', async () => {
            const result = await moneyService.takeMoney(1, -50);
            expect(result).toBe(false);
        });

        test('возвращает false при недостатке средств', async () => {
            mockUserModel.update.mockResolvedValue([0]);
            const logger = require('../logger');
            const result = await moneyService.takeMoney(1, 10000);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('недостаточно'));
        });

        test('защищает от ухода в минус', async () => {
            mockUserModel.update.mockResolvedValue([0]);
            await moneyService.takeMoney(1, 999999);
            expect(mockUserModel.update).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    where: expect.objectContaining({
                        money: { [Op.gte]: 999999 }
                    })
                })
            );
        });
    });

    describe('getBalance', () => {
        test('возвращает баланс существующего аккаунта', async () => {
            accountService.findById.mockResolvedValue({ money: 5000 });
            const balance = await moneyService.getBalance(1);
            expect(balance).toBe(5000);
        });

        test('возвращает null для несуществующего аккаунта', async () => {
            accountService.findById.mockResolvedValue(null);
            const balance = await moneyService.getBalance(999);
            expect(balance).toBeNull();
        });
    });
});