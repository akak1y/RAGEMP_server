<template>
  <div class="hud-container">
    <div class="hud-money">💵 ${{ money }}</div>
    <div class="hud-stats">👥 Всего игроков в БД: {{ totalPlayers }}</div>
  </div>
</template>

<script setup>
// параметры из app.vue
defineProps({
  money: {
    type: Number,
    default: 0
  },
  totalPlayers: {
    type: Number,
    default: 0
  }
})
</script>