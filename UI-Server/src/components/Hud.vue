<template>
  <div class="hud-container">
    <div class="hud-money">💵 ${{ money }}</div>
    <div class="hud-stats">👥 Всего игроков в БД: {{ totalPlayers }}</div>

    <div v-if="inVehicle" class="hud-speedometer">
      <div class="speed-number">{{ speed }}</div>
      <div class="speed-unit">км/ч · {{ vehicleModel }}</div>
      <div class="speed-bar">
        <div
          class="speed-bar-fill"
          :style="{ width: Math.min((speed / MAX_SPEED) * 100, 100) + '%' }"
        ></div>
      </div>
      <div class="hud-fuel">
        <div class="fuel-label">⛽ {{ Math.round(fuel) }}%</div>
        <div class="fuel-bar">
            <div class="fuel-bar-fill" :style="{ width: Math.max(0, Math.min(fuel, 100)) + '%' }"></div>
        </div>
    </div>
    </div>
  </div>
</template>

<script setup>
const MAX_SPEED = 300;

defineProps({
  money: { type: Number, default: 0 },
  totalPlayers: { type: Number, default: 0 },
  speed: { type: Number, default: 0 },
  vehicleModel: { type: String, default: '' },
  inVehicle: { type: Boolean, default: false },
  fuel: { type: Number, default: 100 }
});
</script>