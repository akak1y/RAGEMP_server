<template>
    <div class="window-panel dealership-window">
        <h2>Автосалон Чиллиад</h2>
        <p class="window-desc">Выберите транспортное средство для покупки:</p>
        <div class="window-list">
            <div v-for="(car, key) in cars" :key="key" class="window-item">
                <span>🚘 {{ car.name }} (${{ formatNumber(car.price) }})</span>
                <button class="btn-buy" @click="$emit('buy', key)">Купить</button>
            </div>
        </div>
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
    </div>
</template>

<script setup>
defineProps({
    cars: { type: Object, default: () => ({}) },
});
defineEmits(['buy', 'close']);

const formatNumber = (num) => {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};
</script>
