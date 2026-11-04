<template>
    <div class="window-panel shop-window faction-window">
        <h2>Банк</h2>
        <p class="window-desc">Управление счётом: пополнение, снятие, переводы</p>

        <!--баланс и проценты-->
        <div class="faction-stats">
            <div class="stat-row">
                <span class="stat-label">Баланс счёта</span>
                <span class="stat-value">${{ money(info.balance) }}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Ставка</span>
                <span class="stat-value">{{ interestPct }}% / период</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">След. начисление</span>
                <span class="stat-value">{{ nextInterestText }}</span>
            </div>
            <div v-if="info.pendingPeriods > 0" class="stat-row">
                <span class="stat-label">Ждёт начисления</span>
                <span class="stat-value">{{ info.pendingPeriods }} период(ов)</span>
            </div>
        </div>

        <!--пополнение-->
        <div class="treasury-controls">
            <h3>Пополнить (наличные → счёт)</h3>
            <div class="amount-input">
                <input
                    class="input-field"
                    v-model.number="depositAmount"
                    type="number"
                    min="1"
                    placeholder="сумма"
                />
                <button class="btn-buy" @click="doDeposit">Внести</button>
            </div>
        </div>

        <!--снятие-->
        <div class="treasury-controls">
            <h3>Снять (счёт → наличные)</h3>
            <div class="amount-input">
                <input
                    class="input-field"
                    v-model.number="withdrawAmount"
                    type="number"
                    min="1"
                    placeholder="сумма"
                />
                <button class="btn-buy" @click="doWithdraw">Снять</button>
            </div>
        </div>

        <!--перевод между банковскими счетами-->
        <div class="treasury-controls">
            <h3>Перевод на счёт (по ID)</h3>
            <div class="amount-input">
                <input
                    class="input-field"
                    v-model.number="transferTo"
                    type="number"
                    min="1"
                    placeholder="ID получателя"
                />
                <input
                    class="input-field"
                    v-model.number="transferAmount"
                    type="number"
                    min="1"
                    placeholder="сумма"
                />
                <button class="btn-buy" @click="doTransfer">Перевести</button>
            </div>
        </div>

        <!--история операций-->
        <div class="treasury-controls">
            <h3>История операций</h3>
            <button class="btn-buy" @click="requestLedger">Показать все</button>
            <div class="window-list">
                <div v-for="r in rows" :key="r.id" class="window-item block">
                    <div class="item-info">
                        <span class="item-name">{{ typeLabel(r.type) }}</span>
                        <span :class="r.amount >= 0 ? 'item-price' : ''">
                            {{ r.amount >= 0 ? '+' : '' }}{{ money(r.amount) }}
                        </span>
                    </div>
                    <div class="item-info">
                        <span class="stat-label">Баланс после</span>
                        <span class="stat-value">${{ money(r.balanceAfter) }}</span>
                    </div>
                    <div class="item-info">
                        <span class="stat-label">{{ fmtTime(r.createdAt) }}</span>
                    </div>
                </div>
                <div v-if="!rows.length" class="window-item">
                    <span class="stat-label">Нет операций</span>
                </div>
            </div>
        </div>

        <div
            v-if="resultMessage"
            class="result-message"
            :class="resultSuccess ? 'success' : 'error'"
        >
            {{ resultMessage }}
        </div>
        <button class="btn-close" @click="$emit('close')">Закрыть</button>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    info: {
        type: Object,
        default: () => ({
            balance: 0,
            recent: [],
            limits: {},
            interest: {},
            pendingPeriods: 0,
            nextInterestAt: null,
        }),
    },
    ledger: { type: Array, default: null },
});

const resultMessage = ref('');
const resultSuccess = ref(false);

const depositAmount = ref(null);
const withdrawAmount = ref(null);
const transferTo = ref(null);
const transferAmount = ref(null);

const rows = computed(() => props.ledger || props.info.recent || []);

const interestPct = computed(() => {
    const r = Number(props.info.interest && props.info.interest.ratePerPeriod);
    return Number.isFinite(r) ? Math.round(r * 10000) / 100 : 0;
});

const nextInterestText = computed(() => {
    if (!props.info.nextInterestAt) return '—';
    const left = props.info.nextInterestAt - Date.now();
    if (left <= 0) return 'готово к начислению';
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
});

const money = (v) => (Number(v) || 0).toLocaleString('ru-RU');

const fmtTime = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('ru-RU');
    } catch {
        return String(iso);
    }
};

const typeLabel = (t) => {
    const map = {
        deposit: 'Пополнение',
        withdraw: 'Снятие',
        transfer_in: 'Входящий перевод',
        transfer_out: 'Исходящий перевод',
        interest: 'Процент',
        admin_credit: 'Зачисление (админ)',
        admin_debit: 'Списание (админ)',
        refund: 'Возврат',
    };
    return map[t] || t;
};

const validAmount = (a) => {
    const n = Number(a);
    if (!Number.isInteger(n) || n <= 0) {
        window.bankResult(false, 'Некорректная сумма');
        return null;
    }
    return n;
};

const doDeposit = () => {
    const a = validAmount(depositAmount.value);
    if (a === null) return;
    if (typeof mp !== 'undefined') mp.trigger('client:bank:deposit', a);
    depositAmount.value = null;
};

const doWithdraw = () => {
    const a = validAmount(withdrawAmount.value);
    if (a === null) return;
    if (typeof mp !== 'undefined') mp.trigger('client:bank:withdraw', a);
    withdrawAmount.value = null;
};

const doTransfer = () => {
    const to = Number(transferTo.value);
    const a = validAmount(transferAmount.value);
    if (a === null) return;
    if (!Number.isInteger(to) || to <= 0) {
        window.bankResult(false, 'Некорректный получатель');
        return;
    }
    if (typeof mp !== 'undefined') mp.trigger('client:bank:transfer', to, a);
    transferTo.value = null;
    transferAmount.value = null;
};

const requestLedger = () => {
    if (typeof mp !== 'undefined') mp.trigger('client:bank:requestLedger', 50);
};

window.bankResult = (success, message) => {
    resultSuccess.value = !!success;
    resultMessage.value = String(message);
    setTimeout(() => {
        resultMessage.value = '';
    }, 3000);
};
</script>
