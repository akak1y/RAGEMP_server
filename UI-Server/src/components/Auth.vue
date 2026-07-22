<template>
  <div class="auth-wrapper">
    <div class="auth-card">
      <h1 class="auth-title">Добро пожаловать</h1>
      <p class="auth-subtitle">Авторизуйтесь для входа на сервер</p>
      <div class="input-group">
        <input v-model="username" type="text" placeholder="Введите логин" maxlength="32" />
      </div>
      <div class="input-group">
        <input v-model="password" type="password" placeholder="Введите пароль" />
      </div>

      <button class="auth-button" @click="handleLogin">Войти</button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  error: String // принимаем ошибку ввода
});
const emit = defineEmits(['submit-login']); // регистрация события авторизации
const username = ref('');
const password = ref('');

const handleLogin = () => {
  if (!username.value.trim() || !password.value.trim()) return
  
  emit('submit-login', { // отправляем логин и пароль в app.vue
    username: username.value,
    password: password.value
  })
}
</script>