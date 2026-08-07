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
      :cars="myCars" :pay="payDeliveryCar" :price="priceDeliveryCar"
      @spawn-car="onSpawnCar"
    />
    <!--автосалон-->
    <Dealership
      v-if="windows.dealership"
      :cars="dealershipCars"
      @buy="onBuyCar"
      @close="closeWindow('dealership')"
    />
    <!--тюнинг-->
    <CarCustom
      v-if="windows.carCustom"
      :config="tuningConfig"
      :state="tuningState"
    />
    <!--перехватываем нажатие клавиш-->
    <input
      ref="focusTrap" 
      type="text" 
      class="hidden-focus-trap" 
      @keydown.esc.prevent.stop="handleEscapeClose"
    />
  </div>
  <!--debug окно-->
  <div v-if="windowDebug" class="debug-hud">
    <div class="debug-title">POSITION:</div>
    <div class="coords-grid">
      <div><span class="coord-label">X:</span> {{ currentX }}</div>
      <div><span class="coord-label">Y:</span> {{ currentY }}</div>
      <div><span class="coord-label">Z:</span> {{ currentZ }}</div>
      <div><span class="coord-label">H:</span> {{ currentHeading }}°</div>
    </div>
    <div class="debug-divider"></div>
    <div class="debug-title">DEBUG:</div>
    <div v-for="(log, idx) in debugLogs" :key="idx" class="debug-item" :class="log.type">
      [{{ log.time }}] {{ log.text }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';

import './css/global.css';
import './css/auth.css';
import './css/game.css';
import './css/carCustom.css';

import Auth from './components/Auth.vue';
import Hud from './components/Hud.vue';
import Inventory from './components/Inventory.vue';
import Phone from './components/Phone.vue';
import Dealership from './components/Dealership.vue';
import CarCustom from './components/CarCustom.vue';

const debugLogs = ref([]);
const windowDebug = ref(false);
const currentX = ref(0.0);
const currentY = ref(0.0);
const currentZ = ref(0.0);
const currentHeading = ref(0.0);
const currentScreen = ref('auth'); 
const errorMessage = ref('');
const money = ref(0);
const totalAccounts = ref(0); 
const inventory = ref(new Array(20).fill(null));
const myCars = ref([]);
const dealershipCars = ref({});
const payDeliveryCar = ref(true);
const priceDeliveryCar = ref(0);
const tuningConfig = ref(null);
const tuningState = ref(null);
const windows = ref({ inventory: false, phone: false, dealership: false, carCustom: false });
const focusTrap = ref(null);

const addDebugLog = (text, type = 'info') => {
  const now = new Date();
  const timeStr = `${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  debugLogs.value.push({ time: timeStr, text: text, type: type }); // добавляем строку лога
  if (debugLogs.value.length > 20) { debugLogs.value.shift() } // удаляем 20+
};

watch(windows, (newVal) => {
  const isAnyWindowOpen = Object.values(newVal).some(v => v === true);
  if (isAnyWindowOpen) {
    nextTick(() => { // ждём пока полностью откроется
      setTimeout(() => {
        if (focusTrap.value) focusTrap.value.focus(); // ставим курсор на невидимое поле
      }, 50);
    })
  }
}, { deep: true });

const handleEscapeClose = (event) => {
  event.preventDefault(); // закрываем фокус
  event.stopPropagation();
  for (const winName in windows.value) { // ищем открытое окно
    if (windows.value[winName] === true) {
      windows.value[winName] = false;
      setTimeout(() => {
        if (focusTrap.value) { // снимаем фокус через 150 мс
          focusTrap.value.blur();
        }
        if (typeof mp !== 'undefined') { // прячем курсор
          mp.trigger("client:toggleCursor", false);
          mp.trigger("client:ui:windowStateChanged", winName, false)
        }
      }, 150);
      break
    }
  }
};

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

const onSpawnCar = (carId, pay) => {
  if (typeof mp !== 'undefined') mp.trigger("client:server:spawnCar", carId, pay);
  closeWindow('phone')
};

onMounted(() => { // CEF мост
  window.addEventListener('keydown', (event) => { // перехватывает нажатия клавиш
    if (event.key === 'Escape' || event.keyCode === 27) {
      const isAnyWindowOpen = Object.values(windows.value).some(v => v === true);
      
      if (isAnyWindowOpen) {
        handleEscapeClose(event)
      }
    }
  });
  window.addDebugLog = (msg) => { addDebugLog(msg) };
  
  window.updateDebugCoords = (x, y, z, heading) => {
    currentX.value = Number(x).toFixed(2);
    currentY.value = Number(y).toFixed(2);
    currentZ.value = Number(z).toFixed(2);
    currentHeading.value = Number(heading).toFixed(1);
  };
  window.toggleDebug = (value) => {
    windowDebug.value = value;
    currentScreen.value = 'game'
  };
  window.showAuthError = (message) => { errorMessage.value = message };
  window.updateMoney = (val) => { money.value = val };
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

  window.setPayDeliveryCar = (pay) => { payDeliveryCar.value = pay }
  window.setPriceDeliveryCar = (price) => { priceDeliveryCar.value = price }

  window.setTuningConfig = (json) => {
    try {
      tuningConfig.value = typeof json === 'string' ? JSON.parse(json) : json
    } catch (e) { console.error("[Vue Error] Не удалось распарсить каталог тюнинга:", e) }
  };

  window.setTuningState = (json) => {
    try {
      tuningState.value = typeof json === 'string' ? JSON.parse(json) : json
    } catch (e) { console.error("[Vue Error] Не удалось распарсить состояние тюнинга:", e) }
  };
});
</script>