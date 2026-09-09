const moneyService = require('../services/MoneyService');
const logger = require('../core/logger');
const { sendEvent } = require('../core/eventSender');

/**
 * Денежные методы на прототипе mp.Player
 */

mp.Player.prototype.addMoney = async function (amount, reason = '') {
    try {
        const success = await moneyService.addMoney(this.accountId, amount, reason);
        if (success) {
            this.money += amount;
            sendEvent(this, 'client:updateMoney', [this.money]);
        }
        return success;
    } catch (err) {
        logger.error(`[MoneyApi] addMoney: ${err.message}`);
        return false;
    }
};

mp.Player.prototype.takeMoney = async function (amount, reason = '') {
    try {
        const success = await moneyService.takeMoney(this.accountId, amount, reason);
        if (success) {
            this.money -= amount;
            sendEvent(this, 'client:updateMoney', [this.money]);
        }
        return success;
    } catch (err) {
        logger.error(`[MoneyApi] takeMoney: ${err.message}`);
        return false;
    }
};

mp.Player.prototype.applyMoneyDelta = function (delta) {
    this.money += delta;
    sendEvent(this, 'client:updateMoney', [this.money]);
};
