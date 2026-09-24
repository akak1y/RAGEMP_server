<template>
    <div class="chat-box">
        <!-- история сообщений -->
        <div class="chat-feed" :class="{ open: isOpen }">
            <div v-for="(msg, i) in messages" :key="i" class="chat-line">
                <span v-for="(seg, j) in msg.segments" :key="j" :style="{ color: seg.color }">{{
                    seg.text
                }}</span>
            </div>
        </div>
        <!-- строка ввода, под ней кнопки каналов -->
        <div v-if="isOpen" class="chat-input-area">
            <input
                ref="inputRef"
                v-model="text"
                type="text"
                class="chat-input"
                maxlength="200"
                :placeholder="`Сообщение: ${labels[channel] || channel}`"
                @keyup.enter="send"
                @keydown.esc.prevent.stop="close"
            />
            <div class="chat-channels">
                <button
                    v-for="ch in channels"
                    :key="ch"
                    class="chat-channel-btn"
                    :class="{ active: channel === ch }"
                    @mousedown.prevent
                    @click="channel = ch"
                >
                    {{ labels[ch] || ch }}
                </button>
            </div>
        </div>
    </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';

const MAX_MESSAGES = 60;
const CHANNEL_COLORS = {
    global: '#FFFFFF',
    family: '#FF9933',
    admin: '#FF5555',
    system: '#B0C4DE',
};
const labels = { global: 'Общий', family: 'Семья', admin: 'Админ' };

/**
 * Разбор кодов !{#RRGGBB} на сегменты цвета.
 */
function parseColors(text, defaultColor) {
    const segments = [];
    const re = /!\{#([0-9a-fA-F]{6})\}/g;
    let color = defaultColor;
    let buffer = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
        if (m.index > last) buffer += text.slice(last, m.index);
        if (buffer) {
            segments.push({ color, text: buffer });
            buffer = '';
        }
        color = '#' + m[1];
        last = m.index + m[0].length;
    }
    if (last < text.length) buffer += text.slice(last);
    if (buffer) segments.push({ color, text: buffer });
    if (!segments.length) segments.push({ color: defaultColor, text: '' });
    return segments;
}

/** Префикс канала + разбор цветов внутри текста */
function buildSegments(msg) {
    if (msg.channel === 'system' || !msg.senderName) {
        return parseColors(msg.text || '', CHANNEL_COLORS.system);
    }
    const color = CHANNEL_COLORS[msg.channel] || CHANNEL_COLORS.global;
    const prefix =
        msg.channel === 'family'
            ? `[Семья] ${msg.senderName}: `
            : msg.channel === 'admin'
              ? `[Админ] ${msg.senderName}: `
              : `${msg.senderName}: `;
    return [{ color, text: prefix }, ...parseColors(msg.text || '', color)];
}

const messages = ref([]);
const channels = ref(['global']);
const channel = ref('global');
const isOpen = ref(false);
const text = ref('');
const inputRef = ref(null);
let hideTimer = null;

function onWindowKeydown(e) {
    if (!isOpen.value) return; // чат закрыт — не мешаем окнам/игре
    if (e.key !== 'Escape' && e.keyCode !== 27) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
}

const push = (msg) => {
    messages.value.push({ segments: buildSegments(msg) });
    if (messages.value.length > MAX_MESSAGES) messages.value.shift();
};
const clear = () => {
    messages.value = [];
};
const open = () => {
    if (isOpen.value) return;
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    isOpen.value = true;
    nextTick(() => inputRef.value && inputRef.value.focus());
    if (typeof mp !== 'undefined') mp.trigger('client:chat:openState', true);
};
const close = () => {
    if (!isOpen.value) return;
    isOpen.value = false;
    text.value = '';
    hideTimer = setTimeout(() => {
        hideTimer = null;
        if (typeof mp !== 'undefined') mp.trigger('client:chat:openState', false);
    }, 150);
};
const toggle = () => (isOpen.value ? close() : open());
const send = () => {
    const value = text.value.trim();
    close();
    if (!value || typeof mp === 'undefined') return;
    mp.trigger('client:chat:send', channel.value, value);
};

onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown);
    window.chatPush = push;
    window.chatClear = clear;
    window.chatSetChannels = (list) => {
        channels.value = Array.isArray(list) && list.length ? list : ['global'];
        if (!channels.value.includes(channel.value)) channel.value = channels.value[0];
    };
    window.chatFocus = toggle;
    window.chatClose = close;
    if (typeof mp !== 'undefined') mp.trigger('client:chat:requestState');
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    if (hideTimer) clearTimeout(hideTimer);
    delete window.chatPush;
    delete window.chatClear;
    delete window.chatSetChannels;
    delete window.chatFocus;
    delete window.chatClose;
});
</script>
