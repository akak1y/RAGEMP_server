const moneyService = require('../services/MoneyService');
const logger = require('../core/logger');
const { sendEvent } = require('../core/eventSender');

/**
 * Денежные методы на прототипе mp.Player
 */

/**
 * Безопасная синхронизация HUD.
 * @private
 */
function syncMoneyHud(player) {
    try {
        sendEvent(player, 'client:updateMoney', [player.money]);
    } catch (err) {
        logger.error(
            `[MoneyApi] syncMoneyHud: не удалось отправить обновление баланса ${player.accountName || player.accountId}: ${err.message}`
        );
    }
}

mp.Player.prototype.addMoney = async function (amount, reason = '') {
    try {
        const success = await moneyService.addMoney(this.accountId, amount, reason);
        if (success) {
            this.money += amount;
            syncMoneyHud(this);
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
            syncMoneyHud(this);
        }
        return success;
    } catch (err) {
        logger.error(`[MoneyApi] takeMoney: ${err.message}`);
        return false;
    }
};

mp.Player.prototype.applyMoneyDelta = function (delta) {
    this.money += delta;
    try {
        sendEvent(this, 'client:updateMoney', [this.money]);
    } catch (err) {
        logger.error(
            `[MoneyApi] applyMoneyDelta: не удалось отправить обновление баланса ${this.accountName || this.accountId}: ${err.message}`
        );
    }
};
