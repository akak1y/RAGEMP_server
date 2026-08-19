const { Op, Sequelize } = require('sequelize');
const accountService = require('./AccountService');
const statsService = require('./StatsService');
const logger = require('../core/logger');

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
     * @param {Object} [transaction] - Внешняя Sequelize-транзакция (если null — автокоммит)
     * @returns {Promise<boolean>} Успешность операции
     */
    async addMoney(userId, amount, reason = '', transaction = null) {
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[MoneyService] addMoney отклонена: некорректная сумма ${amount}`);
            return false;
        }

        try {
            const User = this._getModel();
            const [affected] = await User.update(
                { money: Sequelize.literal(`money + ${amount}`) },
                { where: { id: userId }, transaction }
            );
            statsService.invalidateEconomyCache().catch(() => {});
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
     * @param {Object} [transaction] - Внешняя Sequelize-транзакция (если null — автокоммит)
     * @returns {Promise<boolean>} Успешность (false — недостаточно средств)
     */
    async takeMoney(userId, amount, reason = '', transaction = null) {
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[MoneyService] takeMoney отклонена: некорректная сумма ${amount}`);
            return false;
        }

        try {
            const User = this._getModel();
            const [affected] = await User.update(
                { money: Sequelize.literal(`money - ${amount}`) },
                { where: { id: userId, money: { [Op.gte]: amount } }, transaction }
            );
            statsService.invalidateEconomyCache().catch(() => {});
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
     * Перевод между аккаунтами в ОДНОЙ транзакции
     */
    async transfer(fromId, toId, amount, reason = '') {
        if (!Number.isInteger(amount) || amount <= 0) {
            logger.warn(`[MoneyService] transfer отклонена: некорректная сумма ${amount}`);
            return false;
        }
        if (fromId === toId) {
            logger.warn(`[MoneyService] transfer отклонена: самому себе (ID ${fromId})`);
            return false;
        }

        const User = this._getModel();
        const t = await User.sequelize.transaction();
        try {
            const [taken] = await User.update(
                { money: Sequelize.literal(`money - ${amount}`) },
                { where: { id: fromId, money: { [Op.gte]: amount } }, transaction: t }
            );
            if (!taken) { await t.rollback(); return false; } // недостаточно средств

            const [added] = await User.update(
                { money: Sequelize.literal(`money + ${amount}`) },
                { where: { id: toId }, transaction: t }
            );
            if (!added) { await t.rollback(); return false; } // получатель исчез из БД

            await t.commit();
            logger.info(`[MoneyService] Перевод $${amount}: ID ${fromId} → ID ${toId}${reason ? ` (${reason})` : ''}`);
            return true;
        } catch (err) {
            await t.rollback();
            logger.error(`[MoneyService] Ошибка transfer: ${err.message}`);
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