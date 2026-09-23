jest.mock('../models/FactionStorageItem', () => ({ getFactionStorageItemModel: jest.fn() }));
jest.mock('../services/InventoryService', () => ({
    removeItem: jest.fn(),
    giveItem: jest.fn(),
}));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    ItemConfig: { burger: { name: 'Бургер', maxStack: 10 } },
    FactionStorageConfig: { size: 5, minRankDeposit: 0, minRankWithdraw: 0 },
}));
const { getFactionStorageItemModel } = require('../models/FactionStorageItem');
const inventoryService = require('../services/InventoryService');
const factionStorageService = require('../services/FactionStorageService');

const makePlayer = (id, name) => ({ accountId: id, accountName: name });

describe('FactionStorageService: гонки read-modify-write', () => {
    let rows;
    let nextId;
    let mockModel;
    beforeEach(() => {
        jest.clearAllMocks();
        rows = [];
        nextId = 1;
        mockModel = {
            findAll: jest.fn(async () => rows.map((r) => ({ ...r }))),
            create: jest.fn(async (data) => {
                const row = { ...data, id: nextId++ };
                rows.push(row);
                return row;
            }),
            update: jest.fn(async (vals, { where }) => {
                const r = rows.find((x) => x.id === where.id);
                if (!r) return [0];
                Object.assign(r, vals);
                return [1];
            }),
            destroy: jest.fn(async ({ where }) => {
                const idx = rows.findIndex((x) => x.id === where.id);
                if (idx === -1) return 0;
                rows.splice(idx, 1);
                return 1;
            }),
            sequelize: {
                transaction: jest.fn(async () => ({
                    commit: jest.fn(),
                    rollback: jest.fn(),
                })),
            },
        };
        getFactionStorageItemModel.mockReturnValue(mockModel);
        inventoryService.removeItem.mockResolvedValue({ success: true });
        inventoryService.giveItem.mockResolvedValue({ success: true });
    });

    test('параллельные deposit одного предмета: достакинг в один слот, а не дубль', async () => {
        const [r1, r2] = await Promise.all([
            factionStorageService.deposit(makePlayer(1, 'A'), 1, 'burger', 2),
            factionStorageService.deposit(makePlayer(2, 'B'), 1, 'burger', 3),
        ]);
        expect(r1).toEqual({ success: true });
        expect(r2).toEqual({ success: true });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ slot: 0, count: 5, item_id: 'burger' });
    });

    test('параллельные withdraw сверх остатка: второй отклонён, а не списан дважды', async () => {
        rows = [{ faction_id: 1, item_id: 'burger', count: 3, slot: 0, id: nextId++ }];
        const [r1, r2] = await Promise.all([
            factionStorageService.withdraw(makePlayer(1, 'A'), 1, 'burger', 2),
            factionStorageService.withdraw(makePlayer(2, 'B'), 1, 'burger', 2),
        ]);
        const ok = [r1, r2].filter((r) => r.success);
        const poor = [r1, r2].filter((r) => r.error === 'not_enough_items');
        expect(ok).toHaveLength(1);
        expect(poor).toHaveLength(1);
        expect(rows[0].count).toBe(1);
    });
});
