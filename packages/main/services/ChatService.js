const { sendEvent } = require('../core/eventSender');
const factionService = require('./FactionService');
const logger = require('../core/logger');

/**
 * ChatService — каналы кастомного чата и рассылка сообщений.
 */
const CHANNELS = ['global', 'family', 'admin'];
const ADMIN_LEVEL = 1;
const MAX_LENGTH = 200;

class ChatService {
    channels() {
        return CHANNELS;
    }

    /** Каналы, доступные игроку */
    async channelsFor(player) {
        const list = ['global'];
        if ((player.adminLevel || 0) >= ADMIN_LEVEL) list.push('admin');
        const membership = await factionService.getMembership(player.accountId);
        if (membership) list.push('family');
        return list;
    }

    /** Системная строка одному игроку (уведомления сервера, ошибки) */
    pushSystem(player, text) {
        sendEvent(player, 'client:chat:message', [
            JSON.stringify({
                channel: 'system',
                senderId: null,
                senderName: null,
                text: String(text),
                time: Date.now(),
            }),
        ]);
    }

    /** Сообщение игрока в канал: проверка прав + рассылка получателям */
    async send(player, channel, text) {
        if (!player || !player.isLoggedIn) return { success: false, error: 'not_authorized' };
        const clean = String(text ?? '')
            .trim()
            .slice(0, MAX_LENGTH);
        if (!clean) return { success: false, error: 'empty' };
        const ch = CHANNELS.includes(channel) ? channel : 'global';
        const line = {
            channel: ch,
            senderId: player.accountId,
            senderName: player.accountName,
            text: clean,
            time: Date.now(),
        };
        if (ch === 'family') {
            const membership = await factionService.getMembership(player.accountId);
            if (!membership) {
                this.pushSystem(player, '!{#FF3333}[Семья] Вы не состоите в семье.');
                return { success: false, error: 'not_member' };
            }
            const members = await factionService.getMembers(membership.faction.id);
            const ids = new Set(members.map((m) => m.account_id));
            for (const p of mp.players.toArray()) {
                if (p.isLoggedIn && ids.has(p.accountId)) this.#deliver(p, line);
            }
            logger.info(`[Chat] [Семья] ${player.accountName}: ${clean}`);
            return { success: true };
        }
        if (ch === 'admin') {
            if ((player.adminLevel || 0) < ADMIN_LEVEL) {
                this.pushSystem(player, '!{#FF3333}[Админ-чат] Недостаточно прав.');
                return { success: false, error: 'no_permission' };
            }
            for (const p of mp.players.toArray()) {
                if (p.isLoggedIn && (p.adminLevel || 0) >= ADMIN_LEVEL) this.#deliver(p, line);
            }
            logger.info(`[Chat] [Админ] ${player.accountName}: ${clean}`);
            return { success: true };
        }
        for (const p of mp.players.toArray()) {
            if (p.isLoggedIn) this.#deliver(p, line);
        }
        return { success: true };
    }

    /** @private */
    #deliver(player, line) {
        sendEvent(player, 'client:chat:message', [JSON.stringify(line)]);
    }
}
module.exports = new ChatService();
