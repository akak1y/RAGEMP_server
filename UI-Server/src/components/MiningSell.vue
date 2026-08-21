<template>
    <div class="mining-sell-window">
        <h2>Скупщик руды</h2>
        <p class="mining-sell-desc">Игнат принимает железную руду по ${{ info.price }} за штуку.</p>
        <div class="mining-sell-row">
            <span>У вас руды:</span>
            <b>{{ info.oreCount }}</b>
        </div>
        <div class="mining-sell-row">
            <span>К оплате:</span>
            <b class="mining-sell-total">${{ info.total }}</b>
        </div>
        <button class="buy-btn" :disabled="info.oreCount === 0" @click="sell">Продать всё</button>
        <button class="close-btn" @click="$emit('close')">Закрыть</button>
    </div>
</template>

<script setup>
defineProps({
    info: {
        type: Object,
        default: () => ({ oreCount: 0, price: 0, total: 0 }),
    },
});

const sell = () => {
    if (typeof mp !== 'undefined') mp.trigger('client:server:miningSell');
};
</script>
