<template>
    <div class="window-panel shop-window">
        <h2>{{ config.name }}</h2>
        <p class="window-desc">Выберите товары для покупки:</p>
        <div class="window-list">
            <div v-for="(item, idx) in config.items" :key="idx" class="window-item block">
                <div class="item-info">
                    <span class="item-name">{{ getItemName(item.itemId) }}</span>
                    <span class="item-price">${{ item.price }}</span>
                </div>
                <button class="btn-buy full" @click="buy(item)">Купить</button>
            </div>
        </div>
        <div
            v-if="resultMessage"
            class="result-message"
            :class="resultSuccess ? 'success' : 'error'"
        >
            {{ resultMessage }}
        </div>
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
    </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
    config: {
        type: Object,
        default: () => ({ name: 'Магазин', items: [] }),
    },
});

const resultMessage = ref('');
const resultSuccess = ref(false);

const getItemName = (itemId) => {
    const names = {
        burger: 'Бургер',
        water: 'Вода',
        phone: 'Смартфон iFruit',
    };
    return names[itemId] || itemId;
};

const buy = (item) => {
    if (typeof mp !== 'undefined') {
        mp.trigger('client:server:shopBuy', item.itemId, 1);
    }
};

window.showShopResult = (success, message) => {
    resultSuccess.value = success;
    resultMessage.value = message;
    setTimeout(() => {
        resultMessage.value = '';
    }, 3000);
};
</script>
