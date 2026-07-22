<template>
  <div class="dealership-window">
    <h2>Автосалон Чиллиад</h2>
    <p class="dealership-desc">Выберите транспортное средство для покупки:</p>
    <div class="car-list">
      <div v-for="(car, key) in cars" :key="key" class="car-item">
        <span>🚘 {{ car.name }} (${{ formatNumber(car.price) }})</span>
        <button @click="$emit('buy', key)">Купить</button>
      </div>
    </div>
    <button class="close-btn" @click="$emit('close')">Закрыть</button>
  </div>
</template>

<script setup>
defineProps({
  cars: {
    type: Object,
    default: () => ({})
  }
});
defineEmits(['buy', 'close']);

const formatNumber = (num) => {
  if (!num) return "0";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") // форматирование цены
};
</script>