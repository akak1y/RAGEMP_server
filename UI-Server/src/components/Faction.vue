<template>
    <div class="window-panel faction-window">
        <h2>Семья {{ info?.faction.name || '' }}</h2>

        <div v-if="!info" class="window-desc">Загрузка данных...</div>

        <div v-else>
            <!-- Информация о фракции -->
            <div class="faction-stats">
                <div class="stat-row">
                    <span class="stat-label">Казна:</span>
                    <span class="stat-value">${{ formatNumber(info.faction.treasury) }}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Ваш ранг:</span>
                    <span class="stat-value">{{ info.me.rankName }} ({{ info.me.rank }})</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Участников:</span>
                    <span class="stat-value">{{ info.members.length }}</span>
                </div>
            </div>

            <!-- Приглашение -->
            <div v-if="canInvite" class="treasury-controls">
                <h3>Приглашение</h3>
                <div class="amount-input">
                    <input
                        v-model="inviteName"
                        type="text"
                        placeholder="Ник или ID"
                        class="input-field"
                    />
                    <button class="btn-buy" :disabled="!inviteName.trim()" @click="onInvite">
                        Пригласить
                    </button>
                </div>
            </div>

            <!-- Управление кассой -->
            <div class="treasury-controls">
                <h3>Управление кассой</h3>
                <div class="amount-input">
                    <input
                        v-model.number="amount"
                        type="number"
                        min="1"
                        placeholder="Сумма"
                        class="input-field"
                    />
                    <button class="btn-buy" @click="onDeposit" :disabled="!amount || amount <= 0">
                        Внести
                    </button>
                    <button class="btn-buy" @click="onWithdraw" :disabled="!amount || amount <= 0">
                        Снять
                    </button>
                </div>
            </div>

            <!-- Список участников -->
            <div class="members-list">
                <h3>Участники семьи</h3>
                <div class="window-list">
                    <div v-for="member in info.members" :key="member.accountId" class="window-item">
                        <span
                            >ID: {{ member.accountId }} | {{ member.rankName }} ({{
                                member.rank
                            }})</span
                        >
                        <span class="member-actions">
                            <button
                                v-if="canDemote(member)"
                                class="btn-buy"
                                @click="$emit('demote', member.accountId)"
                            >
                                −
                            </button>
                            <button
                                v-if="canPromote(member)"
                                class="btn-buy"
                                @click="$emit('promote', member.accountId)"
                            >
                                +
                            </button>
                            <button
                                v-if="canKick(member)"
                                class="btn-close small"
                                @click="$emit('kick', member.accountId)"
                            >
                                Кик
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <button class="btn-close" @click="$emit('close')">Закрыть</button>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    info: { type: Object, default: null },
});

const emit = defineEmits(['deposit', 'withdraw', 'close', 'invite', 'kick', 'promote', 'demote']);

const amount = ref(0);
const inviteName = ref('');

const myRank = computed(() => (props.info ? props.info.me.rank : -1));
const canInvite = computed(() => myRank.value >= 2);

const canKick = (m) => myRank.value >= 3 && m.rank < myRank.value;
const canPromote = (m) => myRank.value >= 4 && m.rank < myRank.value - 1;
const canDemote = (m) => myRank.value >= 4 && m.rank < myRank.value && m.rank > 0;

const formatNumber = (num) => {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const onDeposit = () => {
    if (amount.value > 0) {
        emit('deposit', amount.value);
        amount.value = 0;
    }
};

const onWithdraw = () => {
    if (amount.value > 0) {
        emit('withdraw', amount.value);
        amount.value = 0;
    }
};

const onInvite = () => {
    const name = inviteName.value.trim();
    if (name) {
        emit('invite', name);
        inviteName.value = '';
    }
};
</script>
