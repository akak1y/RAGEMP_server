const { withLock } = require('../core/asyncLock');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

describe('asyncLock.withLock', () => {
    test('операции на один ключ сериализуются в порядке вызова', async () => {
        const order = [];
        const job = (id, hold) =>
            withLock('k', async () => {
                order.push(`start-${id}`);
                await delay(hold);
                order.push(`end-${id}`);
            });
        await Promise.all([job(1, 30), job(2, 5), job(3, 1)]);
        expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
    });

    test('разные ключи выполняются параллельно', async () => {
        const order = [];
        const job = (key, id, hold) =>
            withLock(key, async () => {
                order.push(`start-${id}`);
                await delay(hold);
                order.push(`end-${id}`);
            });
        await Promise.all([job('a', 1, 30), job('b', 2, 5)]);
        expect(order.indexOf('end-2')).toBeLessThan(order.indexOf('end-1'));
    });

    test('возвращает результат fn (async и sync)', async () => {
        expect(await withLock('k', async () => 42)).toBe(42);
        expect(await withLock('k', () => 7)).toBe(7);
    });

    test('ошибка fn пробрасывается вызывающему и не ломает очередь', async () => {
        await expect(
            withLock('k', async () => {
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');
        expect(await withLock('k', async () => 'ok')).toBe('ok');
    });

    test('синхронный throw fn тоже пробрасывается и не ломает очередь', async () => {
        await expect(
            withLock('k', () => {
                throw new Error('sync');
            })
        ).rejects.toThrow('sync');
        expect(await withLock('k', () => 1)).toBe(1);
    });

    test('длинная цепочка на один ключ не зависает (хвост корректно освобождается)', async () => {
        let n = 0;
        const jobs = [];
        for (let i = 0; i < 50; i++) {
            jobs.push(
                withLock('k', async () => {
                    n++;
                    await delay(0);
                })
            );
        }
        await Promise.all(jobs);
        expect(n).toBe(50);
    });

    test('чередование успеха и ошибки в одной очереди сохраняет порядок', async () => {
        const order = [];
        const safe = (id, fail) =>
            withLock('k', async () => {
                order.push(`s-${id}`);
                await delay(1);
                if (fail) throw new Error(`f-${id}`);
                order.push(`e-${id}`);
            }).catch(() => order.push(`x-${id}`));
        await Promise.all([safe(1, false), safe(2, true), safe(3, false)]);
        expect(order).toEqual(['s-1', 'e-1', 's-2', 'x-2', 's-3', 'e-3']);
    });
});
