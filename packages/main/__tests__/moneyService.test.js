const { Sequelize, Op } = require('sequelize');
const moneyService = require('../services/MoneyService');
const accountService = require('../services/AccountService');

jest.mock('../services/AccountService', () => ({
    getModel: jest.fn(),
    findById: jest.fn()
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

describe('MoneyService', () => {
    let mockUserModel;
    let mockTx;

    beforeEach(() => {
        jest.clearAllMocks();
        mockTx = { commit: jest.fn(), rollback: jest.fn() };
        mockUserModel = {
            update: jest.fn(),
            sequelize: { transaction: jest.fn().mockResolvedValue(mockTx) }
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
                { where: { id: 1 }, transaction: null }
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

        test('прокидывает внешнюю транзакцию в update', async () => {
            mockUserModel.update.mockResolvedValue([1]);
            const result = await moneyService.addMoney(1, 500, 'тест', mockTx);
            expect(result).toBe(true);
            expect(mockUserModel.update).toHaveBeenCalledWith(
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 1 }, transaction: mockTx }
            );
        });
    });

    describe('takeMoney', () => {
        test('успешно списывает деньги', async () => {
            mockUserModel.update.mockResolvedValue([1]);
            const result = await moneyService.takeMoney(1, 300, 'покупка');
            expect(result).toBe(true);
            expect(mockUserModel.update).toHaveBeenCalledWith(
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 1, money: { [Op.gte]: 300 } }, transaction: null }
            );
        });

        test('отклоняет отрицательную сумму', async () => {
            const result = await moneyService.takeMoney(1, -50);
            expect(result).toBe(false);
        });

        test('возвращает false при недостатке средств', async () => {
            mockUserModel.update.mockResolvedValue([0]);
            const result = await moneyService.takeMoney(1, 10000);
            expect(result).toBe(false);
        });

        test('прокидывает внешнюю транзакцию в update', async () => {
            mockUserModel.update.mockResolvedValue([1]);
            const result = await moneyService.takeMoney(1, 300, 'покупка', mockTx);
            expect(result).toBe(true);
            expect(mockUserModel.update).toHaveBeenCalledWith(
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 1, money: { [Op.gte]: 300 } }, transaction: mockTx }
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

    describe('transfer', () => {
        test('успех: commit, оба update внутри транзакции', async () => {
            mockUserModel.update
                .mockResolvedValueOnce([1])
                .mockResolvedValueOnce([1]);

            const result = await moneyService.transfer(1, 2, 500, 'pay');

            expect(result).toBe(true);
            expect(mockUserModel.update).toHaveBeenCalledTimes(2);
            expect(mockUserModel.update).toHaveBeenNthCalledWith(1,
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 1, money: { [Op.gte]: 500 } }, transaction: mockTx }
            );
            expect(mockUserModel.update).toHaveBeenNthCalledWith(2,
                { money: expect.any(Sequelize.Utils.Literal) },
                { where: { id: 2 }, transaction: mockTx }
            );
            expect(mockTx.commit).toHaveBeenCalled();
            expect(mockTx.rollback).not.toHaveBeenCalled();
        });

        test('недостаточно средств: rollback, второй update не тронут', async () => {
            mockUserModel.update.mockResolvedValueOnce([0]);

            const result = await moneyService.transfer(1, 2, 500);

            expect(result).toBe(false);
            expect(mockUserModel.update).toHaveBeenCalledTimes(1);
            expect(mockTx.rollback).toHaveBeenCalled();
            expect(mockTx.commit).not.toHaveBeenCalled();
        });

        test('получатель исчез: rollback после первого update', async () => {
            mockUserModel.update
                .mockResolvedValueOnce([1])
                .mockResolvedValueOnce([0]);

            const result = await moneyService.transfer(1, 2, 500);

            expect(result).toBe(false);
            expect(mockTx.rollback).toHaveBeenCalled();
            expect(mockTx.commit).not.toHaveBeenCalled();
        });

        test('самому себе — без открытия транзакции', async () => {
            const result = await moneyService.transfer(1, 1, 500);
            expect(result).toBe(false);
            expect(mockUserModel.sequelize.transaction).not.toHaveBeenCalled();
        });

        test('некорректная сумма — без открытия транзакции', async () => {
            const result = await moneyService.transfer(1, 2, -10);
            expect(result).toBe(false);
            expect(mockUserModel.sequelize.transaction).not.toHaveBeenCalled();
        });

        test('ошибка БД: rollback и проброс ошибки', async () => {
            mockUserModel.update.mockRejectedValueOnce(new Error('deadlock'));

            await expect(moneyService.transfer(1, 2, 500)).rejects.toThrow('deadlock');
            expect(mockTx.rollback).toHaveBeenCalled();
            expect(mockTx.commit).not.toHaveBeenCalled();
        });
    });
});