const { MiningConfig, BotConfig } = require('../config');
const miningService = require('../services/MiningService');
const inventoryService = require('../services/InventoryService');
const isLoggedIn = require('../middleware/isLoggedIn');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');
const { humanizeError } = require('../core/errorMessages');

/**
 * Шахта: позиции камней, добыча, продажа руды боту
 */

mp.events.add(
    'server:mining:requestPos',
    withGuards(
        [isLoggedIn],
        (player) => {
            sendEvent(player, 'client:mining:setData', [
                JSON.stringify({
                    rocks: MiningConfig.rocks,
                    botPos: BotConfig.position,
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
                sendEvent(player, 'client:mining:startChannel', [
                    Number(rockIndex),
                    MiningConfig.mineTimeMs,
                ]);
            } else {
                player.outputChatBox('!{#FF3333}Подойдите ближе к камню.', { toast: true });
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
            const result = await miningService.completeMine(player);
            if (result.success) {
                player.outputChatBox(`!{#4CAF50}Руда добыта!`, { toast: true });
            } else {
                player.outputChatBox(`!{#FF3333}${humanizeError(result.error)}`, { toast: true });
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
                    '!{#FF3333}[Игнат] Сначала накопай руду в шахте, а потом приходи!',
                    { toast: true }
                );
                return;
            }
            sendEvent(player, 'client:mining:sellInfo', [
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
            sendEvent(player, 'client:mining:sellResult', [result.success, result.message]);
        },
        'mining:sell'
    )
);
