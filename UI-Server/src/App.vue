<template>
  <!--экран авторизации-->
  <Auth 
    v-if="currentScreen === 'auth'"
    :error="errorMessage"
    @submit-login="onLoginSubmit"
  />

  <div v-else class="game-ui">
    <!--худ-->
    <Hud :money="money" :totalPlayers="totalAccounts" />
    <!--инвентарь-->
    <Inventory
      v-if="windows.inventory"
      :items="inventory"
      @close="closeWindow('inventory')"
    />
    <!--телефон-->
    <Phone
      v-if="windows.phone"
      :cars="myCars"
      @spawn-car="onSpawnCar"
    />
    <!--автосалон-->
    <Dealership
      v-if="windows.dealership"
      :cars="dealershipCars"
      @buy="onBuyCar"
      @close="closeWindow('dealership')"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

import './css/global.css';
import './css/auth.css';
import './css/game.css';

import Auth from './components/Auth.vue';
import Hud from './components/Hud.vue';
import Inventory from './components/Inventory.vue';
import Phone from './components/Phone.vue';
import Dealership from './components/Dealership.vue';

const currentScreen = ref('auth'); 
const errorMessage = ref('');
const money = ref(0);
const totalAccounts = ref(0); 
const inventory = ref(new Array(20).fill(null));
const myCars = ref([]);
const dealershipCars = ref({});
const windows = ref({ inventory: false, phone: false, dealership: false });

const toggleWindow = (winName) => {
  windows.value[winName] = !windows.value[winName];
  syncCursorAndChat(winName);
};

const closeWindow = (winName) => {
  windows.value[winName] = false;
  syncCursorAndChat(winName);
};

const syncCursorAndChat = (winName) => {
  const anyOpen = Object.values(windows.value).some(v => v === true);
  if (typeof mp !== 'undefined') { // для тестирования в браузере
    mp.trigger("client:toggleCursor", anyOpen);
    mp.trigger("client:ui:windowStateChanged", winName, windows.value[winName])
  }
};

const onLoginSubmit = (data) => {
  errorMessage.value = '';

  if (typeof mp !== 'undefined') { mp.trigger("client:account:submitLogin", data.username, data.password) } // проверяем данные входа
  else { // для теста в браузере
    money.value = 99999;
    totalAccounts.value = 77;
    currentScreen.value = 'game'
  }
};

const onBuyCar = (model) => {
  if (typeof mp !== 'undefined') mp.trigger("client:server:buyCar", model);
  closeWindow('dealership')
};

const onSpawnCar = (carId) => {
  if (typeof mp !== 'undefined') mp.trigger("client:server:spawnCar", carId);
  closeWindow('phone')
};

onMounted(() => { // CEF мост
  window.showAuthError = (message) => { errorMessage.value = message; };
  window.updateMoney = (val) => { money.value = val; };
  window.updateInventory = (slotsJson, configJson) => { 
    try {
      const parsedSlots = typeof slotsJson === 'string' ? JSON.parse(slotsJson) : slotsJson;
      const itemConfig = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
      if (parsedSlots && itemConfig) {
        inventory.value = parsedSlots.map(slot => {
          if (!slot) return null;
          const configItem = itemConfig[slot.itemId.toLowerCase()]; // ищем предмет в справочнике

          return {
            itemId: slot.itemId,
            count: slot.count,
            displayName: configItem ? configItem.name : slot.itemId
          }
        });
      } else { inventory.value = parsedSlots || new Array(20).fill(null) } // если пришёл сломанные данные
    } catch (e) { console.error("[Vue Error] Ошибка обработки инвентаря:", e) }
  };

  window.toggleWindow = (name) => { toggleWindow(name) };

  window.setPhoneCars = (carsJson, configJson) => {
    try {
      const playerCars = typeof carsJson === 'string' ? JSON.parse(carsJson) : carsJson;
      const vehicleConfig = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
      if (vehicleConfig && playerCars) {
        myCars.value = playerCars.map(car => {
          const configItem = vehicleConfig[car.model.toLowerCase()];
          return {
            id: car.id,
            model: car.model,
            displayName: configItem ? configItem.name : car.model
          }
        })
      } else { myCars.value = playerCars || [] }
    } catch (e) { console.error("[Vue Error] Ошибка обработки гаража в телефоне:", e) }
  };

  window.updateGlobalStats = (count) => { totalAccounts.value = count };

  window.setDealershipCars = (serverConfigJson) => {
    try {
      dealershipCars.value = typeof serverConfigJson === 'string' ? JSON.parse(serverConfigJson) : serverConfigJson
    } catch (e) { console.error("[Vue Error] Не удалось распарсить конфиг автосалона:", e) }
  };

  window.changeScreen = (screenName) => {
    currentScreen.value = screenName;
    if (screenName === 'game' && typeof mp !== 'undefined') { mp.trigger("client:ui:requestStatsUpdate") }
  };
});
</script>