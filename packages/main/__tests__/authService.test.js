const authService = require('../services/AuthService');
const accountService = require('../services/AccountService');

jest.mock('../services/AccountService', () => ({
    findByUsername: jest.fn(),
    createAccount: jest.fn()
}));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('bcryptjs', () => ({
    genSalt: jest.fn().mockResolvedValue('salt'),
    hash: jest.fn().mockResolvedValue('hash'),
    compare: jest.fn()
}));

describe('AuthService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('hashPassword', () => {
        test('успех', async () => {
            const r = await authService.hashPassword('pass123');
            expect(r).toBe('hash');
        });
        test('пустой пароль — throw', async () => {
            await expect(authService.hashPassword('')).rejects.toThrow();
        });
    });

    describe('verifyPassword', () => {
        test('совпадение', async () => {
            const bcrypt = require('bcryptjs');
            bcrypt.compare.mockResolvedValue(true);
            expect(await authService.verifyPassword('pass', 'hash')).toBe(true);
        });
        test('несовпадение', async () => {
            const bcrypt = require('bcryptjs');
            bcrypt.compare.mockResolvedValue(false);
            expect(await authService.verifyPassword('pass', 'hash')).toBe(false);
        });
        test('пустой — false', async () => {
            expect(await authService.verifyPassword('', 'hash')).toBe(false);
        });
    });

    describe('authenticate', () => {
        test('not_found', async () => {
            accountService.findByUsername.mockResolvedValue(null);
            const r = await authService.authenticate('nope', 'pass');
            expect(r.error).toBe('not_found');
        });
        test('wrong_password', async () => {
            accountService.findByUsername.mockResolvedValue({ username: 'akak', password: 'hash' });
            const bcrypt = require('bcryptjs');
            bcrypt.compare.mockResolvedValue(false);
            const r = await authService.authenticate('akak', 'wrong');
            expect(r.error).toBe('wrong_password');
        });
        test('успех', async () => {
            accountService.findByUsername.mockResolvedValue({ username: 'akak', password: 'hash' });
            const bcrypt = require('bcryptjs');
            bcrypt.compare.mockResolvedValue(true);
            const r = await authService.authenticate('akak', 'pass');
            expect(r.success).toBe(true);
            expect(r.user.username).toBe('akak');
        });
    });

    describe('register', () => {
        test('username_taken', async () => {
            accountService.findByUsername.mockResolvedValue({ username: 'akak' });
            const r = await authService.register('akak', 'pass');
            expect(r.error).toBe('username_taken');
        });
        test('успех', async () => {
            accountService.findByUsername.mockResolvedValue(null);
            accountService.createAccount.mockResolvedValue({ username: 'new', password: 'hash' });
            const r = await authService.register('new', 'pass');
            expect(r.success).toBe(true);
            expect(accountService.createAccount).toHaveBeenCalledWith({ username: 'new', password: 'hash' });
        });
        test('ошибка createAccount', async () => {
            accountService.findByUsername.mockResolvedValue(null);
            accountService.createAccount.mockRejectedValue(new Error('DB error'));
            const r = await authService.register('new', 'pass');
            expect(r.success).toBe(false);
            expect(r.error).toBe('DB error');
        });
    });
});