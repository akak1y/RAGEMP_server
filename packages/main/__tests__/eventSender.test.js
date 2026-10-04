jest.mock('../core/eventContracts', () => ({
    validateEvent: jest.fn(),
    contracts: {},
}));

jest.mock('../core/eventLog', () => ({
    push: jest.fn(),
    subscribe: jest.fn(),
    getRecent: jest.fn(),
}));

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { validateEvent } = require('../core/eventContracts');
const eventLog = require('../core/eventLog');
const logger = require('../core/logger');
const { sendEvent } = require('../core/eventSender');

const makePlayer = (overrides = {}) => ({
    accountId: 1,
    accountName: 'tester',
    call: jest.fn(),
    ...overrides,
});

describe('eventSender', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        validateEvent.mockReturnValue(true);
    });

    test('валидное событие доставляется и возвращает true', () => {
        const player = makePlayer();

        const result = sendEvent(player, 'client:updateMoney', [500]);

        expect(result).toBe(true);
        expect(validateEvent).toHaveBeenCalledWith('client:updateMoney', [500]);
        expect(player.call).toHaveBeenCalledWith('client:updateMoney', [500]);
        expect(eventLog.push).toHaveBeenCalledWith(
            expect.objectContaining({
                player: 'tester[1]',
                event: 'client:updateMoney',
                args: [500],
                ok: true,
            })
        );
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('невалидное событие не доставляется и возвращает false', () => {
        validateEvent.mockReturnValue(false);
        const player = makePlayer();

        const result = sendEvent(player, 'client:updateMoney', ['not-a-number']);

        expect(result).toBe(false);
        expect(player.call).not.toHaveBeenCalled();
        expect(eventLog.push).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'client:updateMoney',
                ok: false,
            })
        );
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('отправка отклонена (невалидные аргументы)')
        );
    });

    test('исключение player.call не бросает наружу и возвращает false', () => {
        const player = makePlayer({
            call: jest.fn(() => {
                throw new Error('client gone');
            }),
        });

        let result;
        expect(() => {
            result = sendEvent(player, 'client:chat:message', ['hello']);
        }).not.toThrow();

        expect(result).toBe(false);
        expect(player.call).toHaveBeenCalledWith('client:chat:message', ['hello']);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('не удалось доставить событие tester[1]')
        );
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('client gone'));
    });

    test('отсутствующий игрок не ломает sendEvent', () => {
        const result = sendEvent(null, 'client:updateMoney', [100]);

        expect(result).toBe(false);
        expect(eventLog.push).toHaveBeenCalledWith(
            expect.objectContaining({
                player: '?',
                event: 'client:updateMoney',
                ok: true,
            })
        );
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('игрок недоступен для отправки события')
        );
    });

    test('сбой доставки одному игроку не прерывает рассылку другим', () => {
        const dead = makePlayer({
            accountId: 1,
            accountName: 'dead',
            call: jest.fn(() => {
                throw new Error('client gone');
            }),
        });

        const alive = makePlayer({
            accountId: 2,
            accountName: 'alive',
            call: jest.fn(),
        });

        const results = [dead, alive].map((p) =>
            sendEvent(p, 'client:chat:message', ['important'])
        );

        expect(results).toEqual([false, true]);
        expect(dead.call).toHaveBeenCalledWith('client:chat:message', ['important']);
        expect(alive.call).toHaveBeenCalledWith('client:chat:message', ['important']);
    });
});
