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
            <!-- Семейный склад -->
            <div class="treasury-controls">
                <h3>Семейный склад</h3>
                <p v-if="!storage" class="window-desc">Склад доступен только у базы семьи</p>
                <div v-else>
                    <div class="amount-input">
                        <input
                            v-model.number="storageAmount"
                            type="number"
                            min="1"
                            placeholder="Кол-во"
                            class="input-field"
                        />
                    </div>
                    <div class="window-list">
                        <div
                            v-for="slot in storage.items"
                            :key="'s' + slot.slot"
                            class="window-item"
                        >
                            <span>📦 {{ slot.name }} x{{ slot.count }}</span>
                            <button
                                v-if="storage.canWithdraw"
                                class="btn-buy"
                                :disabled="
                                    !storageAmount ||
                                    storageAmount <= 0 ||
                                    storageAmount > slot.count
                                "
                                @click="$emit('storage-withdraw', slot.itemId, storageAmount)"
                            >
                                Взять
                            </button>
                        </div>
                        <div v-if="!storage.items.length" class="window-item">
                            <span>Склад пуст</span>
                        </div>
                    </div>
                    <h3>Ваши предметы</h3>
                    <div class="window-list">
                        <div v-for="(slot, idx) in myItems" :key="'i' + idx" class="window-item">
                            <span>{{ slot.displayName }} x{{ slot.count }}</span>
                            <button
                                v-if="storage.canDeposit"
                                class="btn-buy"
                                :disabled="
                                    !storageAmount ||
                                    storageAmount <= 0 ||
                                    storageAmount > slot.count
                                "
                                @click="$emit('storage-deposit', slot.itemId, storageAmount)"
                            >
                                Сдать
                            </button>
                        </div>
                        <div v-if="!myItems.length" class="window-item">
                            <span>Нет предметов</span>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Семейный арсенал -->
            <div class="treasury-controls">
                <h3>Семейный арсенал</h3>
                <p v-if="!armory" class="window-desc">Арсенал доступен только у базы семьи</p>
                <div v-else>
                    <div class="stat-row">
                        <span class="stat-label">Займы:</span>
                        <span class="stat-value"
                            >{{ armory.loans.length }} / {{ armory.maxLoans }}</span
                        >
                    </div>
                    <div class="amount-input">
                        <input
                            v-model.number="armoryAmount"
                            type="number"
                            min="1"
                            placeholder="Кол-во"
                            class="input-field"
                        />
                    </div>
                    <h3>Стволы на складе</h3>
                    <div class="window-list">
                        <div v-for="w in armory.weapons" :key="'w' + w.slot" class="window-item">
                            <span>🔫 {{ w.name }} x{{ w.count }}</span>
                            <button
                                v-if="armory.canTake"
                                class="btn-buy"
                                :disabled="takeDisabled(w)"
                                @click="$emit('armory-take', w.itemId, armoryAmount)"
                            >
                                Взять
                            </button>
                        </div>
                        <div v-if="!armory.weapons.length" class="window-item">
                            <span>На складе нет стволов</span>
                        </div>
                    </div>
                    <h3>Ваши займы</h3>
                    <div class="window-list">
                        <div v-for="loan in armory.loans" :key="'l' + loan.id" class="window-item">
                            <span>{{ loan.itemId }} x{{ loan.count }}</span>
                            <button
                                class="btn-buy"
                                :disabled="returnDisabled(loan)"
                                @click="$emit('armory-return', loan.itemId, armoryAmount)"
                            >
                                Вернуть
                            </button>
                        </div>
                        <div v-if="!armory.loans.length" class="window-item">
                            <span>Долгов нет</span>
                        </div>
                    </div>
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
    storage: { type: Object, default: null },
    armory: { type: Object, default: null },
    inventory: { type: Array, default: () => [] },
});

const emit = defineEmits([
    'deposit',
    'withdraw',
    'close',
    'invite',
    'kick',
    'promote',
    'demote',
    'storage-deposit',
    'storage-withdraw',
    'armory-take',
    'armory-return',
]);

const amount = ref(0);
const inviteName = ref('');
const storageAmount = ref(1);
const armoryAmount = ref(1);

const myRank = computed(() => (props.info ? props.info.me.rank : -1));
const canInvite = computed(() => myRank.value >= 2);

const canKick = (m) => myRank.value >= 3 && m.rank < myRank.value;
const canPromote = (m) => myRank.value >= 4 && m.rank < myRank.value - 1;
const canDemote = (m) => myRank.value >= 4 && m.rank < myRank.value && m.rank > 0;
const myItems = computed(() => (props.inventory || []).filter((s) => s));

const takeDisabled = (w) => {
    if (!armoryAmount.value || armoryAmount.value <= 0 || armoryAmount.value > w.count) return true;
    const hasLoan = props.armory.loans.some((l) => l.itemId === w.itemId);
    return !hasLoan && props.armory.loans.length >= props.armory.maxLoans;
};

const returnDisabled = (loan) =>
    !armoryAmount.value || armoryAmount.value <= 0 || armoryAmount.value > loan.count;

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
