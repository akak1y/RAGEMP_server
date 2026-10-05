jest.mock('../services/AccountService', () => ({
    findByUsername: jest.fn(),
    createAccount: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
    genSalt: jest.fn().mockResolvedValue('salt'),
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const authService = require('../services/AuthService');
const accountService = require('../services/AccountService');

describe('AuthService: разделение not_found и ошибок БД', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('authenticate: если аккаунт не найден, возвращает not_found', async () => {
        accountService.findByUsername.mockResolvedValue(null);

        const result = await authService.authenticate('new_user', 'password');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'not_found',
        });
    });

    test('authenticate: ошибка БД пробрасывается наружу, а не превращается в not_found', async () => {
        accountService.findByUsername.mockRejectedValue(new Error('MySQL connection lost'));

        await expect(authService.authenticate('miner1', 'password')).rejects.toThrow(
            'MySQL connection lost'
        );
    });

    test('register: ошибка findByUsername при регистрации возвращается как db_error', async () => {
        accountService.findByUsername.mockRejectedValue(new Error('connection lost'));

        const result = await authService.register('miner1', 'password');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'db_error',
        });
    });

    test('register: неизвестная ошибка createAccount возвращается как db_error', async () => {
        accountService.findByUsername.mockResolvedValue(null);
        accountService.createAccount.mockRejectedValue(new Error('deadlock detected'));

        const result = await authService.register('miner1', 'password');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'db_error',
        });
    });

    test('register: username_taken возвращается структурно', async () => {
        accountService.findByUsername.mockResolvedValue({
            id: 1,
            username: 'miner1',
        });

        const result = await authService.register('miner1', 'password');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'username_taken',
        });
    });

    test('register: ошибка username_taken из createAccount возвращается структурно', async () => {
        accountService.findByUsername.mockResolvedValue(null);

        const err = new Error('Username "miner1" уже занят');
        err.code = 'username_taken';
        accountService.createAccount.mockRejectedValue(err);

        const result = await authService.register('miner1', 'password');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'username_taken',
        });
    });

    test('register: invalid_username возвращается структурно', async () => {
        accountService.findByUsername.mockResolvedValue(null);

        const err = new Error('Username может содержать только буквы и цифры');
        err.code = 'invalid_username';
        accountService.createAccount.mockRejectedValue(err);

        const result = await authService.register('miner!1', 'password');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'invalid_username',
        });
    });

    test('register: пустой пароль возвращается как invalid_password', async () => {
        accountService.findByUsername.mockResolvedValue(null);

        const result = await authService.register('miner1', '');

        expect(result).toEqual({
            success: false,
            user: null,
            error: 'invalid_password',
        });

        expect(accountService.createAccount).not.toHaveBeenCalled();
    });
});
