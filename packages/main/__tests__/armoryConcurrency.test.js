jest.mock('../models/FactionArmoryLoan', () => ({ getFactionArmoryLoanModel: jest.fn() }));
jest.mock('../services/FactionStorageService', () => ({
    withdraw: jest.fn(),
    deposit: jest.fn(),
}));
jest.mock('../services/InventoryService', () => ({ countItem: jest.fn() }));
jest.mock('../core/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
    ArmoryConfig: { maxActiveLoans: 1, minRankTake: 0 },
    WeaponConfig: {
        weapon_pistol: { ammoType: 'ammo_9mm' },
        weapon_smg: { ammoType: 'ammo_9mm' },
    },
}));
const { getFactionArmoryLoanModel } = require('../models/FactionArmoryLoan');
const factionStorageService = require('../services/FactionStorageService');
const inventoryService = require('../services/InventoryService');
const armoryService = require('../services/ArmoryService');

const makePlayer = (id = 1, name = 'A') => ({ accountId: id, accountName: name });

describe('ArmoryService: гонки по займам', () => {
    let loans;
    let nextId;
    let mockModel;
    const row = (data) => ({
        ...data,
        destroy: jest.fn(async () => {
            const i = loans.findIndex((x) => x.id === data.id);
            if (i !== -1) loans.splice(i, 1);
        }),
        update: jest.fn(async (vals) => Object.assign(data, vals)),
    });
    beforeEach(() => {
        jest.clearAllMocks();
        loans = [];
        nextId = 1;
        mockModel = {
            findAll: jest.fn(async ({ where }) =>
                loans.filter((l) => l.account_id === where.account_id).map((l) => row(l))
            ),
            findOne: jest.fn(async ({ where }) => {
                const l = loans.find(
                    (x) =>
                        x.faction_id === where.faction_id &&
                        x.account_id === where.account_id &&
                        x.item_id === where.item_id
                );
                return l ? row(l) : null;
            }),
            create: jest.fn(async (data) => {
                const stored = { ...data, id: nextId++ };
                loans.push(stored);
                return stored;
            }),
            update: jest.fn(async (vals, { where }) => {
                const l = loans.find((x) => x.id === where.id);
                if (!l) return [0];
                Object.assign(l, vals);
                return [1];
            }),
            destroy: jest.fn(async ({ where }) => {
                const i = loans.findIndex((x) => x.id === where.id);
                if (i === -1) return 0;
                loans.splice(i, 1);
                return 1;
            }),
        };
        getFactionArmoryLoanModel.mockReturnValue(mockModel);
        factionStorageService.withdraw.mockResolvedValue({ success: true });
        factionStorageService.deposit.mockResolvedValue({ success: true });
        inventoryService.countItem.mockReturnValue(999);
    });

    test('параллельные issue при лимите: ровно один проходит, второй too_many_loans', async () => {
        const p = makePlayer();
        const [r1, r2] = await Promise.all([
            armoryService.issue(p, 1, 'weapon_pistol', 1),
            armoryService.issue(p, 1, 'weapon_smg', 1),
        ]);
        const ok = [r1, r2].filter((r) => r.success);
        const tooMany = [r1, r2].filter((r) => r.error === 'too_many_loans');
        expect(ok).toHaveLength(1);
        expect(tooMany).toHaveLength(1);
        expect(loans).toHaveLength(1);
    });

    test('параллельные issue одного ствола: count растёт дважды, а не затирается', async () => {
        loans = [
            { faction_id: 1, account_id: 1, item_id: 'weapon_pistol', count: 2, id: nextId++ },
        ];
        require('../config').ArmoryConfig.maxActiveLoans = 5;
        const p = makePlayer();
        await Promise.all([
            armoryService.issue(p, 1, 'weapon_pistol', 1),
            armoryService.issue(p, 1, 'weapon_pistol', 1),
        ]);
        expect(loans[0].count).toBe(4);
        require('../config').ArmoryConfig.maxActiveLoans = 1;
    });

    test('параллельные returnItem одного займа: депозит на склад один раз', async () => {
        loans = [
            { faction_id: 1, account_id: 1, item_id: 'weapon_pistol', count: 5, id: nextId++ },
        ];
        const p = makePlayer();
        const [r1, r2] = await Promise.all([
            armoryService.returnItem(p, 1, 'weapon_pistol', 5),
            armoryService.returnItem(p, 1, 'weapon_pistol', 5),
        ]);
        const ok = [r1, r2].filter((r) => r.success);
        const noLoan = [r1, r2].filter((r) => r.error === 'no_loan');
        expect(ok).toHaveLength(1);
        expect(noLoan).toHaveLength(1);
        expect(factionStorageService.deposit).toHaveBeenCalledTimes(1);
        expect(loans).toHaveLength(0);
    });
});
