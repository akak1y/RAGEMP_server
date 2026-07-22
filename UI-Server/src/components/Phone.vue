<template>
  <div class="phone-wrapper">
    <div class="phone-screen">
      <div class="phone-header">Akak OS</div>
      <div class="phone-apps-list">
        <p class="phone-section-title">Ваш гараж:</p>
        <div v-if="cars.length > 0" class="cars-scroll-area">
          <button v-for="car in cars" :key="car.id" class="phone-app-car" @click="$emit('spawn-car', car.id)">
            🚗 Доставить {{ car.displayName }}
          </button>
        </div>
        <p v-else class="phone-empty-text">У вас нет купленного транспорта</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  cars: {
    type: Array,
    default: () => []
  }
});
defineEmits(['spawn-car'])
</script>