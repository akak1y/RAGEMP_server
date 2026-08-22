<template>
    <div class="custom-shop">
        <div class="menu-container">
            <div class="shop-header">
                <h1>LSC</h1>
                <p class="subtitle">Модификация транспорта</p>
            </div>
            <!-- загрузка каталога с сервера -->
            <div v-if="!config" class="loading-hint">
                <span>Загрузка каталога...</span>
            </div>
            <!-- главное меню: категории -->
            <div v-else-if="currentCategory === 'main'" class="items-list">
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
            <!-- подменю: опции конкретной категории -->
            <div v-else class="items-list">
                <button class="menu-btn back-btn" @click="currentCategory = 'main'">
                    <span>⬅ Назад</span>
                </button>
                <div class="category-title">
                    {{ categories[currentCategory].title }}
                </div>
                <button
                    v-for="(option, idx) in categories[currentCategory].options"
                    :key="idx"
                    class="menu-btn option-btn"
                    :class="{ installed: option.installed, disabled: option.installed }"
                    @click="!option.installed && buyUpgrade(currentCategory, option)"
                >
                    <span>{{ option.installed ? `✓ ${option.name}` : option.name }}</span>
                    <span class="price-tag">{{
                        option.installed ? 'Установлено' : `${option.price}$`
                    }}</span>
                </button>
            </div>
        </div>
        <!-- подсказка ESC -->
        <div class="controls-hint"><span class="hint-key">ESC</span> Выйти из LSC</div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
const props = defineProps({
    config: { type: Object, default: null },
    state: { type: Object, default: null },
});

const currentCategory = ref('main');

const categories = computed(() => {
    if (!props.config) return {};
    const cfg = props.config;
    const st = props.state || {};
    const result = {};

    if (cfg.colors && Array.isArray(cfg.colors)) {
        result.color = {
            title: 'Цвет кузова',
            options: cfg.colors.map((c) => ({
                name: c.name,
                price: cfg.colorPrice,
                value: { r: c.value.r, g: c.value.g, b: c.value.b },
                installed:
                    st.color &&
                    st.color.r === c.value.r &&
                    st.color.g === c.value.g &&
                    st.color.b === c.value.b,
            })),
        };
    }

    if (cfg.performanceMods) {
        for (const [key, mod] of Object.entries(cfg.performanceMods)) {
            const current = st[key];
            result[key] = {
                title: mod.title,
                options: [
                    {
                        name: mod.title,
                        price: mod.price,
                        value: {},
                        installed: typeof current === 'number' && current >= mod.topLevel,
                    },
                ],
            };
        }
    }

    if (cfg.wheels && Array.isArray(cfg.wheels.options)) {
        const currentWheels = st.wheels || {};
        result.wheels = {
            title: cfg.wheels.title,
            options: cfg.wheels.options.map((opt) => ({
                name: opt.name,
                price: opt.price,
                value: { wheelType: opt.wheelType, wheelId: opt.wheelId },
                installed:
                    currentWheels.wheelType === opt.wheelType &&
                    currentWheels.wheelId === opt.wheelId,
            })),
        };
    }

    return result;
});

const selectCategory = (key) => {
    currentCategory.value = key;
    const trap = document.querySelector('.hidden-focus-trap');
    if (trap) trap.focus();
};

const buyUpgrade = (categoryKey, option) => {
    if (option.installed) return;
    if (typeof mp === 'undefined') return;

    mp.trigger(
        'client:custom:applyUpgrade',
        categoryKey,
        JSON.stringify(option.value),
        option.price
    );

    const trap = document.querySelector('.hidden-focus-trap');
    if (trap) trap.focus();
};
</script>
