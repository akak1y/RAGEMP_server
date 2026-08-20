const logger = require('../core/logger');

/**
 * Денежные методы на прототипе mp.Player
 */

mp.Player.prototype.addMoney = async function (amount, reason = '') {
    try {
        const success = await require('../services/MoneyService').addMoney(
            this.accountId,
            amount,
            reason
        );
        if (success) {
            this.money += amount;
            this.call('client:updateMoney', [this.money]);
        }
        return success;
    } catch (err) {
        logger.error(`[MoneyApi] addMoney: ${err.message}`);
        return false;
    }
};

mp.Player.prototype.takeMoney = async function (amount, reason = '') {
    try {
        const success = await require('../services/MoneyService').takeMoney(
            this.accountId,
            amount,
            reason
        );
        if (success) {
            this.money -= amount;
            this.call('client:updateMoney', [this.money]);
        }
        return success;
    } catch (err) {
        logger.error(`[MoneyApi] takeMoney: ${err.message}`);
        return false;
    }
};

mp.Player.prototype.applyMoneyDelta = function (delta) {
    this.money += delta;
    this.call('client:updateMoney', [this.money]);
};
