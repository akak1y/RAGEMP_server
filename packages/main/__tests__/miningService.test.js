const miningService = require('../services/MiningService');
const inventoryService = require('../services/InventoryService');
const auditService = require('../services/AuditService');
const locationService = require('../services/LocationService');
const { MiningConfig, BotSpawnPos } = require('../config');

jest.mock('../services/InventoryService');
jest.mock('../services/AuditService');
jest.mock('../services/LocationService');

const atRock = () => ({
    accountId: 1,
    accountName: 'miner1',
    position: {
        x: MiningConfig.rocks[0].x,
        y: MiningConfig.rocks[0].y,
        z: MiningConfig.rocks[0].z,
    },
});

const atBot = () => ({
    accountId: 1,
    accountName: 'miner1',
    position: { x: BotSpawnPos.x, y: BotSpawnPos.y, z: BotSpawnPos.z },
});

describe('MiningService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        miningService.activeMiners.clear();
        miningService.shiftStats.clear();
        miningService.rockState.forEach((s) => {
            s.depleted = false;
            s.respawnAt = 0;
        });
    });

    describe('startWork', () => {
        test('успешно начинает работу у камня', () => {
            expect(miningService.startWork(atRock(), 0)).toBe(true);
            expect(miningService.activeMiners.has(1)).toBe(true);
        });

        test('отклоняет если далеко от камня', () => {
            const player = { accountId: 1, accountName: 'miner1', position: { x: 0, y: 0, z: 0 } };
            expect(miningService.startWork(player, 0)).toBe(false);
        });

        test('отклоняет исчерпанный камень', () => {
            miningService.rockState[0].depleted = true;
            expect(miningService.startWork(atRock(), 0)).toBe(false);
            expect(miningService.activeMiners.has(1)).toBe(false);
        });
    });

    describe('completeMine', () => {
        test('успешно добывает руду', async () => {
            const player = atRock();
            miningService.startWork(player, 0);
            miningService.activeMiners.get(1).startedAt -= MiningConfig.mineTimeMs + 100;

            inventoryService.giveItem.mockResolvedValue(true);
            auditService.logPlayer.mockResolvedValue({ id: 1 });
            locationService.hideRock.mockImplementation(() => {});

            expect(await miningService.completeMine(player)).toBe(true);
            expect(inventoryService.giveItem).toHaveBeenCalledWith(player, 'ore', 1);
            expect(miningService.shiftStats.get(1)).toBe(1);
            expect(locationService.hideRock).toHaveBeenCalledWith(0);
            expect(miningService.rockState[0].depleted).toBe(true);
        });

        test('античит: слишком быстрое завершение', async () => {
            const player = atRock();
            miningService.startWork(player, 0);

            expect(await miningService.completeMine(player)).toBe(false);
            expect(inventoryService.giveItem).not.toHaveBeenCalled();
            expect(miningService.rockState[0].depleted).toBe(false);
        });

        test('античит: отошёл от камня', async () => {
            const player = atRock();
            miningService.startWork(player, 0);
            miningService.activeMiners.get(1).startedAt -= MiningConfig.mineTimeMs + 100;
            player.position = { x: 0, y: 0, z: 0 };

            expect(await miningService.completeMine(player)).toBe(false);
            expect(inventoryService.giveItem).not.toHaveBeenCalled();
        });
    });

    describe('sellAllOre', () => {
        test('успешно продаёт всю руду боту', async () => {
            const player = atBot();
            player.addMoney = jest.fn().mockResolvedValue(true);

            inventoryService.countItem.mockReturnValue(5);
            inventoryService.removeItem.mockResolvedValue(true);
            auditService.logPlayer.mockResolvedValue({ id: 1 });

            const result = await miningService.sellAllOre(player);
            expect(result.success).toBe(true);
            expect(player.addMoney).toHaveBeenCalledWith(5 * MiningConfig.oreSellPrice, 'mining');
        });

        test('нет руды — продажа отклонена', async () => {
            const player = atBot();
            player.addMoney = jest.fn().mockResolvedValue(true);
            inventoryService.countItem.mockReturnValue(0);

            const result = await miningService.sellAllOre(player);
            expect(result.success).toBe(false);
            expect(player.addMoney).not.toHaveBeenCalled();
        });

        test('далеко от бота — продажа отклонена', async () => {
            const player = { accountId: 1, accountName: 'miner1', position: { x: 0, y: 0, z: 0 } };
            player.addMoney = jest.fn().mockResolvedValue(true);

            const result = await miningService.sellAllOre(player);
            expect(result.success).toBe(false);
            expect(player.addMoney).not.toHaveBeenCalled();
        });
    });

    describe('rockState', () => {
        test('респавн камня после таймера', () => {
            miningService.rockState[0] = { depleted: true, respawnAt: Date.now() - 1 };
            locationService.showRock.mockImplementation(() => {});

            miningService.respawnCheck();
            expect(miningService.rockState[0].depleted).toBe(false);
            expect(locationService.showRock).toHaveBeenCalledWith(0);
        });

        test('randomRespawnDelay: в диапазоне min..max', () => {
            const min = MiningConfig.rockRespawnMinMs;
            const max = MiningConfig.rockRespawnMaxMs;
            for (let i = 0; i < 50; i++) {
                const delay = miningService.randomRespawnDelay();
                expect(delay).toBeGreaterThanOrEqual(min);
                expect(delay).toBeLessThan(max);
            }
        });

        test('getRocksActive: массив активных камней', () => {
            miningService.rockState[0].depleted = true;
            miningService.rockState[1].depleted = false;
            miningService.rockState[2].depleted = true;

            const active = miningService.getRocksActive();
            expect(active).toEqual([false, true, false]);
        });
    });
});
