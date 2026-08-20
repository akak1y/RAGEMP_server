const logger = require('../core/logger');

/**
 * Сервис для работы с данными аккаунтов
 */
class AccountService {
    constructor() {
        this._model = null;
        this._initialized = false;
    }

    /**
     * Инициализация сервиса
     * @throws {Error} Если модель не может быть инициализирована
     */
    initialize() {
        if (this._initialized) {
            logger.warn('[AccountService] Сервис уже инициализирован');
            return;
        }

        try {
            const { getUserModel } = require('../models/Users');
            this._model = getUserModel();

            if (!this._model) throw new Error('User модель не определена');
            if (!this._model.sequelize) throw new Error('User модель не подключена к БД');
            this._initialized = true;
            logger.info('[AccountService] Сервис успешно инициализирован');
        } catch (err) {
            logger.error(`[AccountService] Ошибка инициализации: ${err.message}`);
            throw err;
        }
    }

    /**
     * Внутренняя проверка инициализации
     * @private
     */
    _ensureInitialized() {
        if (!this._initialized || !this._model)
            throw new Error('[AccountService] Сервис не инициализирован');
    }

    /**
     * Валидация username
     * @private
     */
    _validateUsername(username) {
        if (!username || typeof username !== 'string')
            throw new Error('Username не должно быть пустым');
        const trimmed = username.trim().toLowerCase();

        if (trimmed.length > 32) throw new Error('Username должно содержать не более 32 символов');
        if (!/^[a-zA-Z0-9]+$/.test(trimmed))
            throw new Error('Username может содержать только буквы и цифры');

        return trimmed;
    }

    /**
     * Поиск пользователя по ID
     * @param {number} id - ID пользователя
     * @returns {Promise<User|null>}
     */
    async findById(id) {
        this._ensureInitialized();

        if (!Number.isInteger(id) || id <= 0) {
            logger.warn(`[AccountService] findById: неверный id ${id}`);
            return null;
        }

        try {
            return await this._model.findByPk(id);
        } catch (err) {
            logger.error(`[AccountService] findById error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Поиск пользователя по username
     * @param {string} username - Логин игрока
     * @returns {Promise<User|null>}
     */
    async findByUsername(username) {
        this._ensureInitialized();

        try {
            const validatedUsername = this._validateUsername(username);
            return await this._model.findOne({
                where: { username: validatedUsername },
            });
        } catch (err) {
            logger.error(`[AccountService] findByUsername error: ${err.message}`);
            return null;
        }
    }

    /**
     * Поиск пользователя по HWID
     * @param {string} hwid - Hardware ID
     * @returns {Promise<User|null>}
     */
    async findByHwid(hwid) {
        this._ensureInitialized();
        if (!hwid || typeof hwid !== 'string') {
            return null;
        }

        try {
            return await this._model.findOne({
                where: { hwid: hwid.trim() },
            });
        } catch (err) {
            logger.error(`[AccountService] findByHwid error: ${err.message}`);
            return null;
        }
    }

    /**
     * Создание нового аккаунта
     * @param {Object} data - Данные аккаунта
     * @param {string} data.username - Логин (обязательно)
     * @param {string} data.password - Хэшированный пароль (обязательно)
     * @param {string} [data.hwid=''] - Hardware ID
     * @param {number} [data.money=50000] - Начальный баланс
     * @param {number} [data.admin_level=0] - Уровень админа
     * @returns {Promise<User>}
     */
    async createAccount(data) {
        this._ensureInitialized();
        if (!data || typeof data !== 'object')
            throw new Error('Данные аккаунта должны быть объектом');
        if (!data.password) throw new Error('Требуется пароль');

        try {
            const validatedUsername = this._validateUsername(data.username);
            const accountData = {
                username: validatedUsername,
                password: data.password,
                hwid: data.hwid || '',
                money: Number.isInteger(data.money) ? data.money : 50000,
                admin_level: Number.isInteger(data.admin_level) ? data.admin_level : 0,
                pos_x: -436.0,
                pos_y: -162.0,
                pos_z: 39.0,
            };

            const user = await this._model.create(accountData);
            logger.info(`[AccountService] Создан аккаунт: ${validatedUsername} (ID: ${user.id})`);
            return user;
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                throw new Error(`Username "${data.username}" уже занят`);
            }
            logger.error(`[AccountService] createAccount error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Обновление данных аккаунта
     * @param {number} userId - ID пользователя
     * @param {Object} updateData - Данные для обновления
     * @returns {Promise<boolean>} Успешность обновления
     */
    async updateAccount(userId, updateData) {
        this._ensureInitialized();

        if (!Number.isInteger(userId) || userId <= 0) {
            logger.warn(`[AccountService] updateAccount: неверный userId ${userId}`);
            return false;
        }
        if (!updateData || typeof updateData !== 'object') {
            logger.warn('[AccountService] updateAccount: неверный updateData');
            return false;
        }

        const allowedFields = {
            // разрешено менять поля
            money: (val) => Number.isInteger(val) && val >= 0,
            admin_level: (val) => Number.isInteger(val) && val >= 0,
            pos_x: (val) => typeof val === 'number',
            pos_y: (val) => typeof val === 'number',
            pos_z: (val) => typeof val === 'number',
            hwid: (val) => typeof val === 'string',
            last_login: (val) => val instanceof Date || typeof val === 'number',
        };

        const safeData = {};

        for (const [key, validator] of Object.entries(allowedFields)) {
            if (key in updateData) {
                const value = updateData[key];
                if (validator(value)) {
                    safeData[key] = value;
                } else {
                    logger.warn(`[AccountService] updateAccount: недопустимое значение для ${key}`);
                }
            }
        }

        if (Object.keys(safeData).length === 0) {
            logger.warn('[AccountService] updateAccount: нет допустимых полей для обновления');
            return false;
        }

        try {
            const [affectedRows] = await this._model.update(safeData, {
                where: { id: userId },
            });

            if (affectedRows > 0) {
                logger.info(
                    `[AccountService] Обновлен аккаунт ID ${userId}: ${Object.keys(safeData).join(', ')}`
                );
                return true;
            }
            return false;
        } catch (err) {
            logger.error(`[AccountService] updateAccount error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Обновление позиции игрока
     * @param {number} userId - ID пользователя
     * @param {Object} position - Позиция {x, y, z}
     * @returns {Promise<boolean>}
     */
    async updatePosition(userId, position) {
        if (!position || typeof position !== 'object') return false;
        return await this.updateAccount(userId, {
            pos_x: position.x,
            pos_y: position.y,
            pos_z: position.z,
        });
    }

    /**
     * Удаление аккаунта
     * @param {number} userId - ID пользователя
     * @returns {Promise<boolean>}
     */
    async deleteAccount(userId) {
        this._ensureInitialized();

        if (!Number.isInteger(userId) || userId <= 0) {
            logger.warn(`[AccountService] deleteAccount: неверный userId ${userId}`);
            return false;
        }

        try {
            const user = await this.findById(userId);
            if (!user) {
                logger.warn(`[AccountService] deleteAccount: пользователь ${userId} не найден`);
                return false;
            }
            const username = user.username;
            await user.destroy();
            logger.info(`[AccountService] Удален аккаунт: ${username} (ID: ${userId})`);
            return true;
        } catch (err) {
            logger.error(`[AccountService] deleteAccount error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Получение общего количества аккаунтов
     * @returns {Promise<number>}
     */
    async getTotalCount() {
        this._ensureInitialized();
        try {
            return await this._model.count();
        } catch (err) {
            logger.error(`[AccountService] getTotalCount error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Получение списка всех аккаунтов
     * @param {Array<string>} [attributes] - Список полей для выборки
     * @returns {Promise<Array<Object>>}
     */
    async getAllAccounts(attributes = ['id', 'username', 'money', 'admin_level']) {
        this._ensureInitialized();

        try {
            const users = await this._model.findAll({ attributes });
            return users.map((u) => u.toJSON());
        } catch (err) {
            logger.error(`[AccountService] getAllAccounts error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Проверка существования аккаунта
     * @param {string} username - Логин
     * @returns {Promise<boolean>}
     */
    async exists(username) {
        try {
            const user = await this.findByUsername(username);
            return user !== null;
        } catch (err) {
            return false;
        }
    }

    /**
     * Получение "сырой" модели
     * @returns {Model}
     */
    getModel() {
        this._ensureInitialized();
        return this._model;
    }
}

module.exports = new AccountService();
