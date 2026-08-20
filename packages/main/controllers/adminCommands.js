const accountService = require('../services/AccountService');
const statsService = require('../services/StatsService');
const auditService = require('../services/AuditService');
const healthService = require('../services/HealthService');
const inventoryService = require('../services/InventoryService');
const isAdmin = require('../middleware/isAdmin');
const { registerCommand } = require('./commandSystem');
const { getRedis } = require('../core/redis');

const adminOnly = isAdmin(1);
const moderatorOnly = isAdmin(2);

/**
 * Админские команды.
 */

registerCommand('checkban', {
    guards: [adminOnly],
    run: async (player, args) => {
        const targetUsername = args.join(' ').trim();
        if (!targetUsername) return player.outputChatBox('Использование: /checkban [логин]');

        const redis = getRedis();
        const cacheKey = `server:cache:bancheck:${targetUsername.toLowerCase()}`;
        const cachedResult = await redis.get(cacheKey);
        if (cachedResult !== null) {
            player.outputChatBox(`!{#00FF00}[Redis КЭШ] Игрок ${targetUsername} проверен.`);
            return;
        }
        const userCheck = await accountService.findByUsername(targetUsername);
        if (!userCheck) {
            player.outputChatBox(`!{#FFaa00}[MySQL] Игрок "${targetUsername}" не найден.`);
            return;
        }
        await redis.set(cacheKey, 'clear', { EX: 60 });
        player.outputChatBox(`!{#FFcc00}[MySQL] Данные считаны через ORM и закэшированы на 60с.`);
    },
});

registerCommand('givemoney', {
    guards: [adminOnly],
    run: async (player, args) => {
        const amount = parseInt(args);
        if (isNaN(amount)) return player.outputChatBox('Использование: /givemoney [количество]');
        const success = await player.addMoney(amount);
        if (success) {
            player.outputChatBox(`[Админ] Вы выдали себе $${amount}`);
            auditService.logPlayer(player, 'givemoney', { category: 'money', amount });
        } else {
            player.outputChatBox(
                '!{#FF3333}[Ошибка] Некорректная сумма. Нужно целое число больше 0.'
            );
        }
    },
});

registerCommand('giveitem', {
    guards: [adminOnly],
    run: async (player, args) => {
        const itemId = args[0] ? args[0].toLowerCase().trim() : null;
        const count = parseInt(args[1]) || 1;
        if (!itemId)
            return player.outputChatBox(
                'Использование: /giveitem [phone / burger / water] [количество]'
            );
        const success = await inventoryService.giveItem(player, itemId, count);
        if (success) {
            player.outputChatBox(`!{#33FF33}[Админ] Получен предмет: ${itemId} (${count} шт)`);
        } else {
            player.outputChatBox(
                '!{#FF3333}[Ошибка] Не удалось выдать предмет. Возможно, нет свободного слота.'
            );
        }
    },
});

registerCommand('bd', {
    guards: [adminOnly],
    run: async (player, _args) => {
        const cachedTotal = await getRedis().get('server:stats:total_accounts');
        const rowsForTable = await accountService.getAllAccounts();
        console.log('========== ТЕКУЩИЙ СПИСОК АККАУНТОВ В БД ==========');
        console.table(rowsForTable);
        console.log('=================================================');
        player.outputChatBox(
            `[Успех] Игроков в системе (из Redis): ${cachedTotal || rowsForTable.length}`
        );
    },
});

registerCommand('delacc', {
    guards: [moderatorOnly],
    run: async (player, args) => {
        const targetUsername = args.join(' ').trim();
        if (!targetUsername) return player.outputChatBox('Использование: /delacc [логин]');

        const userToDestroy = await accountService.findByUsername(targetUsername);
        if (userToDestroy) {
            await accountService.deleteAccount(userToDestroy.id);
            player.outputChatBox(`[Успех] Аккаунт ${targetUsername} успешно удален через ORM.`);
            mp.players.forEach((targetPlayer) => {
                if (
                    targetPlayer.accountName &&
                    targetPlayer.accountName.toLowerCase() === targetUsername.toLowerCase()
                ) {
                    targetPlayer.kick('Ваш аккаунт был удален администратором.');
                    console.log(
                        `[Admin] Игрок ${targetUsername} был принудительно кикнут (аккаунт удален).`
                    );
                }
            });
        } else {
            player.outputChatBox('Ошибка: Данный логин не найден в базе.');
        }
    },
});

registerCommand('stats', {
    guards: [adminOnly],
    run: async (player) => {
        const economy = await statsService.getEconomyStats();
        const online = statsService.getOnlineStats();
        const top = await statsService.getTopPlayers(3);

        const lines = [
            `!{#00FFFF}[Stats] Онлайн: ${online.online} | Машин в мире: ${online.vehicles} | Аккаунтов: ${economy.total}`,
            `!{#00FFFF}[Stats] В экономике: $${economy.totalMoney} | В среднем: $${economy.avgMoney} | Максимум: $${economy.maxMoney}`,
            `!{#00FFFF}[Stats] Источник: ${economy.source === 'redis' ? 'Redis' : 'MySQL'} (${economy.ms} мс)`,
            `!{#00FFFF}[Stats] Топ: ` + top.map((t) => `${t.username} ($${t.money})`).join(', '),
        ];
        lines.forEach((line) => player.outputChatBox(line));

        player.call('client:ui:debugLog', [
            `[Stats] economy from ${economy.source} in ${economy.ms}ms`,
            'cpp-event',
        ]);
    },
});

registerCommand('sethp', {
    guards: [adminOnly],
    run: (player, args) => {
        const value = Number(args[0]);
        if (!args[0] || Number.isNaN(value))
            return player.outputChatBox('!{#FF3333}Использование: /sethp [1-100]');
        const hp = healthService.setHealth(player, value);
        player.outputChatBox(`!{#00FFFF}[HP] Здоровье установлено: ${hp}`);
    },
});

registerCommand('heal', {
    guards: [adminOnly],
    run: (player) => {
        healthService.setHealth(player, 100);
        player.outputChatBox('!{#00FF00}[HP] Вы полностью вылечены');
    },
});

registerCommand('kill', {
    guards: [adminOnly],
    run: (player) => {
        player.health = 0;
    },
});

registerCommand('audit', {
    guards: [adminOnly],
    run: async (player, args) => {
        const limit = Math.min(Number(args[0]) || 10, 50);
        const rows = await auditService.getRecent(limit, args[1] || null);
        player.outputChatBox(`!{#FFFF00}[Audit] Записей: ${rows.length}`);
        rows.forEach((r) => {
            const date = new Date(r.created_at).toLocaleString('ru-RU');
            const amount = r.amount != null ? ` $${r.amount}` : '';
            const repeats = r.repeats ? ` x${r.repeats}` : '';
            const target = r.target ? ` → ${r.target}` : '';
            const ok = r.success ? '' : ' [FAIL]';
            player.outputChatBox(
                `!{#B0C4DE}[${date}] ${r.actor}: ${r.action}${target}${amount}${repeats}${ok}`
            );
        });
    },
});

registerCommand('bench', {
    guards: [adminOnly],
    run: async (player, args) => {
        const iterations = Math.min(Number(args[0]) || 50, 100);

        const bench = await statsService.benchmarkRedis(iterations);
        await statsService.invalidateEconomyCache();
        const cold = await statsService.getEconomyStats();
        const warm = await statsService.getEconomyStats();

        player.outputChatBox(
            `!{#00FFFF}[Bench] Redis синтетика (${bench.iterations} GET): ${bench.avgMs} мс/запрос`
        );
        player.outputChatBox(`!{#FFcc00}[Bench] MySQL холодный (агрегация): ${cold.ms} мс`);
        player.outputChatBox(`!{#00FF00}[Bench] Redis тёплый (реальный GET): ${warm.ms} мс`);
    },
});
