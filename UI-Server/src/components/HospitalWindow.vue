<template>
    <div v-if="open" class="window-panel hospital-window">
        <h2>Больница</h2>
        <p class="window-desc">Восстановить здоровье до 100%?</p>
        <div class="window-item">
            <span>Лечение</span>
            <span class="item-price">${{ price }}</span>
        </div>
        <button class="btn-buy full" @click="$emit('heal')">Лечиться</button>
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
    </div>
</template>

<script setup>
defineProps({
    open: Boolean,
    price: { type: Number, default: 0 },
});
defineEmits(['heal', 'close']);
</script>
