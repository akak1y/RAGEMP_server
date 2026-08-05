const { Op, Sequelize } = require('sequelize');
const accountService = require('./AccountService');
const logger = require('../logger');

/**
 * Сервис денежных операций
 */
class MoneyService {
    /**
     * Внутренний доступ к модели User через AccountService
     * @private
     */
    _getModel() {
        return accountService.getModel();
    }

    /**
     * Выдать деньги игроку (атомарная операция на уровне SQL)
     * @param {number} userId - ID аккаунта
     * @param {number} amount - Сумма (целое число, больше 0)
     * @param {string} [reason] - Причина для лога
     * @returns {Promise<boolean>} Успешность операции
     */
    async addMoney(userId, amount, reason = '') {
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[MoneyService] addMoney отклонена: некорректная сумма ${amount}`);
            return false;
        }

        try {
            const User = this._getModel();
            const [affected] = await User.update(
                { money: Sequelize.literal(`money + ${amount}`) },
                { where: { id: userId } }
            );

            if (affected > 0) {
                logger.info(`[MoneyService] +$${amount} игроку ID ${userId}${reason ? ` (${reason})` : ''}`);
                return true;
            }
            return false;
        } catch (err) {
            logger.error(`[MoneyService] Ошибка addMoney: ${err.message}`);
            throw err;
        }
    }

    /**
     * Списать деньги у игрока (атомарно: баланс никогда не уйдёт в минус)
     * @param {number} userId - ID аккаунта
     * @param {number} amount - Сумма (целое число, больше 0)
     * @param {string} [reason] - Причина для лога
     * @returns {Promise<boolean>} Успешность (false — недостаточно средств)
     */
    async takeMoney(userId, amount, reason = '') {
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[MoneyService] takeMoney отклонена: некорректная сумма ${amount}`);
            return false;
        }

        try {
            const User = this._getModel();
            const [affected] = await User.update(
                { money: Sequelize.literal(`money - ${amount}`) },
                { where: { id: userId, money: { [Op.gte]: amount } } }
            );

            if (affected > 0) {
                logger.info(`[MoneyService] -$${amount} у игрока ID ${userId}${reason ? ` (${reason})` : ''}`);
                return true;
            }
            logger.warn(`[MoneyService] У игрока ID ${userId} недостаточно средств для -$${amount}`);
            return false;
        } catch (err) {
            logger.error(`[MoneyService] Ошибка takeMoney: ${err.message}`);
            throw err;
        }
    }

    /**
     * Получить текущий баланс из БД
     * @param {number} userId - ID аккаунта
     * @returns {Promise<number|null>} Баланс или null, если аккаунт не найден
     */
    async getBalance(userId) {
        const user = await accountService.findById(userId);
        return user ? user.money : null;
    }
}

module.exports = new MoneyService()