const bcrypt = require('bcryptjs');
const accountService = require('./AccountService');
const logger = require('../core/logger');

/**
 * Сервис авторизации и работы с паролями
 */
class AuthService {
    /**
     * Хэширование пароля
     * @param {string} password - Исходный пароль
     * @returns {Promise<string>} Хэш пароля
     */
    async hashPassword(password) {
        if (!password || typeof password !== 'string')
            throw new Error('[AuthService] hashPassword: пароль должен быть непустой строкой');
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    }

    /**
     * Проверка пароля по хэшу
     * @param {string} password - Введённый пароль
     * @param {string} hashedPassword - Хэш из БД
     * @returns {Promise<boolean>} Совпадение паролей
     */
    async verifyPassword(password, hashedPassword) {
        if (!password || !hashedPassword) return false;
        return await bcrypt.compare(password, hashedPassword);
    }

    /**
     * Вход игрока: поиск аккаунта + проверка пароля
     * @param {string} username - Логин
     * @param {string} password - Пароль
     * @returns {Promise<{success: boolean, user: Object|null, error: string|null}>}
     */
    async authenticate(username, password) {
        const user = await accountService.findByUsername(username);

        if (!user) return { success: false, user: null, error: 'not_found' };

        const isValid = await this.verifyPassword(password, user.password);
        if (!isValid) {
            logger.warn(`[AuthService] Игрок ${username} ввел неверный пароль.`);
            return { success: false, user: null, error: 'wrong_password' };
        }
        return { success: true, user, error: null };
    }

    /**
     * Регистрация нового аккаунта
     * @param {string} username - Логин
     * @param {string} password - Исходный пароль
     * @param {Object} [options] - Доп. данные
     * @returns {Promise<{success: boolean, user: Object|null, error: string|null}>}
     */
    async register(username, password, options = {}) {
        try {
            const existing = await accountService.findByUsername(username);
            if (existing) return { success: false, user: null, error: 'username_taken' };

            const hashedPassword = await this.hashPassword(password);
            const user = await accountService.createAccount({
                username,
                password: hashedPassword,
                ...options,
            });

            logger.info(`[AuthService] Зарегистрирован новый аккаунт: ${user.username}`);
            return { success: true, user, error: null };
        } catch (err) {
            logger.warn(`[AuthService] Отказ в регистрации: ${err.message}`);
            return { success: false, user: null, error: err.message };
        }
    }
}

module.exports = new AuthService();
