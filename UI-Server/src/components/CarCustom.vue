<template>
  <div class="custom-shop">
    <div class="menu-container">
      <div class="shop-header">
        <h1>LSC</h1>
        <p class="subtitle">Модификация транспорта</p>
      </div>
      <div v-if="currentCategory === 'main'" class="items-list">
        <button 
          v-for="(cat, key) in categories"
          :key="key"
          class="menu-btn"
          @click="selectCategory(key)"
        >
          <span>{{ cat.title }}</span>
          <span class="arrow">➔</span>
        </button>
      </div>
      <!-- перечисление общих названий -->
      <div v-else class="items-list">
        <button class="menu-btn back-btn" @click="currentCategory = 'main'">
          <span>⬅ Назад</span>
        </button>
        <div class="category-title">
          {{ categories[currentCategory].title }}
        </div>
        <!-- перечисление опций тюнинга -->
        <button 
          v-for="(option, idx) in categories[currentCategory].options"
          :key="idx"
          class="menu-btn option-btn"
          @click="buyUpgrade(currentCategory, option)"
        >
          <span>{{ option.name }}</span>
          <span class="price-tag">{{ option.price }}$</span>
        </button>
      </div>
    </div>
    <!-- подсказка ESC -->
    <div class="controls-hint">
      <span>[ESC] — Выйти из LSC</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const currentCategory = ref('main');

const categories = ref({
  color: {
    title: 'Цвет кузова',
    options: [
      { name: 'Черный', value: { r: 0, g: 0, b: 0 }, price: 1000 },
      { name: 'Белый', value: { r: 255, g: 255, b: 255 }, price: 1000 },
      { name: 'Красный', value: { r: 200, g: 0, b: 0 }, price: 1000 },
      { name: 'Желтый', value: { r: 255, g: 215, b: 0 }, price: 1000 }
    ]
  },
  engine: {
    title: 'Технический тюнинг',
    options: [
      { name: 'Двигатель', value: 1, price: 1000 },
      { name: 'Тормоза', value: 2, price: 2000 },
      { name: 'Коробка передач', value: 3, price: 3000 },
      { name: 'Турбо-наддув', value: 4, price: 4000 }
    ]
  },
  wheels: {
    title: 'Диски',
    options: [
      { name: 'Спортивные', value: 0, price: 1000 },
      { name: 'Внедорожные', value: 1, price: 2000 }
    ]
  }
});

const selectCategory = (key) => { // выбор категории меню
  currentCategory.value = key;
  const trap = document.querySelector('.hidden-focus-trap');
  if (trap) trap.focus();
};

const buyUpgrade = (categoryKey, option) => {
  if (typeof mp !== 'undefined') { mp.trigger("client:custom:applyUpgrade", categoryKey, JSON.stringify(option.value), option.price) }
  const trap = document.querySelector('.hidden-focus-trap');
  if (trap) trap.focus();
};
/*const closeShop = () => {
  if (typeof mp !== 'undefined' && window.toggleWindow) { window.toggleWindow(`carCustom`) }
};*/
</script>