import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    // Принудительно компилируем в стандарт ES2015 (ES6), понятный старому CEF
    target: 'es2015', 
    // Отключаем современный cssCodeSplit, который может ломать стили в старых Chromium
    cssCodeSplit: false,
    // Настройки минификации для стабильной работы скриптов кнопок
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Убираем современные полифиллы модулей
        format: 'iife' 
      }
    }
  }
});
