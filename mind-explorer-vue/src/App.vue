<template>
  <div class="flex min-h-screen flex-col bg-[#fafbfc]">
    <AppNavbar />
    <main class="flex-1 w-full max-w-app mx-auto px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <RouterView />
    </main>
    <AppFooter />
    <FloatingCompanion />
    <BadgeCelebration />
  </div>
</template>

<script setup>
import AppNavbar from './components/AppNavbar.vue'
import AppFooter from './components/AppFooter.vue'
import FloatingCompanion from './components/FloatingCompanion.vue'
import BadgeCelebration from './components/BadgeCelebration.vue'
</script>
