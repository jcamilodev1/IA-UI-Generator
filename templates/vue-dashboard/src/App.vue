<script setup>
import { ref } from 'vue'

const isDark = ref(false)

const toggleDarkMode = () => {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}
</script>

<template>
  <div :class="{ dark: isDark }" class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
    <!-- Este es el template base que será reemplazado por el generador -->
    <div class="container mx-auto p-6">
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-3xl font-bold text-gray-800 dark:text-white">Dashboard</h1>
        <button 
          @click="toggleDarkMode"
          class="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <span class="text-gray-600 dark:text-gray-300">🌙</span>
        </button>
      </div>
      
      <div class="text-center text-gray-600 dark:text-gray-400">
        <p>Template base - será reemplazado por el generador AI</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
