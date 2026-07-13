<template>
  <div class="app-layout">
    <AppNavbar />
    <main class="app-main">
      <RouterView />
    </main>
    <AppFooter />
    <FloatingCompanion />
  </div>
</template>

<script setup>
import AppNavbar from './components/AppNavbar.vue'
import AppFooter from './components/AppFooter.vue'
import FloatingCompanion from './components/FloatingCompanion.vue'
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
</style>
