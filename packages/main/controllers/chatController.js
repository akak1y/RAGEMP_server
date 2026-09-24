const chatService = require('../services/ChatService');
const { dispatchCommand, registerCommand, visibleCommands } = require('./commandSystem');
const isLoggedIn = require('../middleware/isLoggedIn');
const isAdmin = require('../middleware/isAdmin');
const rateLimit = require('../middleware/rateLimit');
const withGuards = require('../middleware/withGuards');
const { sendEvent } = require('../core/eventSender');

/**
 * Кастомный чат: полностью замещает встроенный.
 * Прототипное присваивание — запасной слой; основной путь — per-instance
 * outputChatBox в authController (own выигрывает у нативного own и прототипа).
 */
mp.Player.prototype.outputChatBox = function (text) {
    chatService.pushSystem(this, text);
};

/** Сообщение из CEF-ввода: обычный текст или /команда */
mp.events.add(
    'server:chat:send',
    withGuards(
        [isLoggedIn, rateLimit('chat_send', 4, 5)],
        async (player, channel, text) => {
            const raw = String(text ?? '').trim();
            if (!raw) return;
            if (raw.length > 200)
                return chatService.pushSystem(
                    player,
                    '!{#FF3333}[Чат] Сообщение длиннее 200 символов.'
                );
            if (raw.startsWith('/')) {
                const handled = await dispatchCommand(player, raw.slice(1));
                if (!handled)
                    chatService.pushSystem(
                        player,
                        `!{#FF3333}[Чат] Неизвестная команда: ${raw.split(/[ ]+/)[0]}`
                    );
                return;
            }
            await chatService.send(player, String(channel ?? 'global'), raw);
        },
        'chat:send'
    )
);

/** Доступные игроку каналы для кнопок UI */
mp.events.add(
    'server:chat:requestState',
    withGuards(
        [isLoggedIn],
        async (player) => {
            sendEvent(player, 'client:chat:state', [
                JSON.stringify(await chatService.channelsFor(player)),
            ]);
        },
        'chat:requestState'
    )
);

/** Админ-чат: /a [сообщение] */
registerCommand('a', {
    guards: [isLoggedIn, isAdmin(1)],
    description: 'Сообщение в админ-чат',
    run: async (player, args) => {
        const text = (args || []).join(' ').trim();
        if (!text) return player.outputChatBox('!{#FF3333}Использование: /a [сообщение]');
        await chatService.send(player, 'admin', text);
    },
});

/** Справка: список команд, доступных по правам игрока */
registerCommand('help', {
    guards: [isLoggedIn],
    description: 'Список доступных команд',
    run: (player) => {
        const list = visibleCommands(player);
        player.outputChatBox('!{#B0C4DE}[Справка] Доступные команды:');
        for (const c of list) {
            player.outputChatBox(
                `!{#FFFFFF}/${c.name}${c.description ? ` — ${c.description}` : ''}`
            );
        }
    },
});
