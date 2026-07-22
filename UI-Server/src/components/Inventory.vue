<template>
  <div class="inventory-window">
    <div class="inventory-header">
      <h3>Инвентарь</h3>
      <!-- крестик, отправляем сигнал о закрытии окна-->
      <button class="inv-close-btn" @click="$emit('close')">✕</button>
    </div>
    <div class="inventory-grid">
      <!-- для каждой ячейки рисуем квадратик -->
      <div v-for="(slot, idx) in items" :key="idx" class="inv-slot">
        <div v-if="slot" class="item-inner">
          <span class="item-name">{{ slot.displayName }}</span>
          <span class="item-count">x{{ slot.count }}</span>
        </div>
        <div v-else class="empty-slot">{{ idx + 1 }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: Array
});
defineEmits(['close'])
</script>