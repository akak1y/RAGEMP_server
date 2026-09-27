<template>
    <TransitionGroup name="toast" tag="div" class="toasts-container">
        <div v-for="t in toasts" :key="t.id" class="toast-item" :style="{ color: t.color }">
            {{ t.text }}
        </div>
    </TransitionGroup>
</template>
<script setup>
import { ref } from 'vue';

const MAX_TOASTS = 3;
const TOAST_DURATION_MS = 3000;
let nextId = 1;
const timers = new Map();

const toasts = ref([]);

function show(text, colorOverride) {
    let cleanText = String(text ?? '');
    let color = '#FFFFFF';
    const match = cleanText.match(/^!\{#([0-9a-fA-F]{6})\}/);
    if (match) {
        color = '#' + match[1];
        cleanText = cleanText.slice(match[0].length).trimStart();
    }
    if (colorOverride) color = colorOverride;

    const id = nextId++;
    toasts.value.unshift({ id, text: cleanText, color });
    while (toasts.value.length > MAX_TOASTS) {
        const removed = toasts.value.pop();
        if (removed && timers.has(removed.id)) clearTimeout(timers.get(removed.id));
    }
    const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    timers.set(id, timer);
}

function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
    if (timers.has(id)) {
        clearTimeout(timers.get(id));
        timers.delete(id);
    }
}

defineExpose({ show });
</script>
<style scoped>
.toasts-container {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column-reverse;
    gap: 6px;
    z-index: 9999;
    pointer-events: none;
}
.toast-item {
    background: rgba(0, 0, 0, 0.78);
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 13px;
    line-height: 1.35;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
}
.toast-enter-active,
.toast-leave-active {
    transition: all 0.22s ease-out;
}
.toast-enter-from {
    opacity: 0;
    transform: translateY(12px);
}
.toast-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}
</style>
