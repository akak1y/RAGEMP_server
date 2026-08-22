const { MiningConfig, BotSpawnPos } = require('../config');
const miningService = require('../services/MiningService');
const inventoryService = require('../services/InventoryService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');

/**
 * Шахта: позиции камней, добыча, продажа руды боту
 */

mp.events.add(
    'server:mining:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            player.call('client:mining:setData', [
                JSON.stringify({
                    rocks: MiningConfig.rocks,
                    botPos: BotSpawnPos,
                    active: miningService.getRocksActive(),
                }),
            ]);
        },
        'mining:requestPos'
    )
);

mp.events.add(
    'server:mining:start',
    withGuards(
        [isLoggedIn, rateLimit('mining:start', 5, 5)],
        (player, rockIndex) => {
            const ok = miningService.startWork(player, Number(rockIndex));
            if (ok) {
                player.call('client:mining:startChannel', [
                    Number(rockIndex),
                    MiningConfig.mineTimeMs,
                ]);
            } else {
                player.outputChatBox('!{#FF3333}[Шахта] Подойдите ближе к камню.');
            }
        },
        'mining:start'
    )
);

mp.events.add(
    'server:mining:complete',
    withGuards(
        [isLoggedIn, rateLimit('mining:complete', 5, 5)],
        async (player) => {
            const ok = await miningService.completeMine(player);
            if (ok) {
                const count = miningService.getShiftCount(player.accountId);
                player.outputChatBox(`!{#4CAF50}[Шахта] Руда добыта! Всего за смену: ${count}`);
            } else {
                player.outputChatBox('!{#FF3333}[Шахта] Добыча не удалась.');
            }
        },
        'mining:complete'
    )
);

mp.events.add(
    'server:mining:requestSellInfo',
    withGuards(
        [isLoggedIn],
        (player) => {
            const oreCount = inventoryService.countItem(player, 'ore');
            if (oreCount === 0) {
                player.outputChatBox(
                    '!{#FF3333}[Игнат] Сначала накопай руду в шахте, а потом приходи!'
                );
                return;
            }
            player.call('client:mining:sellInfo', [
                JSON.stringify({
                    oreCount,
                    price: MiningConfig.oreSellPrice,
                    total: oreCount * MiningConfig.oreSellPrice,
                }),
            ]);
        },
        'mining:requestSellInfo'
    )
);

mp.events.add(
    'server:mining:sell',
    withGuards(
        [isLoggedIn, rateLimit('mining:sell', 5, 5)],
        async (player) => {
            const result = await miningService.sellAllOre(player);
            player.call('client:mining:sellResult', [result.success, result.message]);
        },
        'mining:sell'
    )
);

mp.events.add(
    'server:mining:enterZone',
    withGuards(
        [isLoggedIn, rateLimit('mining:enter', 5, 10)],
        (player) => {
            miningService.greetPlayer(player);
        },
        'mining:enter'
    )
);
