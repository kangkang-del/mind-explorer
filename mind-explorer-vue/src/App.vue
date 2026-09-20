<template>
  <div class="flex min-h-screen flex-col bg-[#fafbfc]">
    <AppNavbar />
    <main class="flex-1 w-full max-w-app mx-auto px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <RouterView />
    </main>
    <AppFooter />
    <!-- M1 小木桌宠：全站常驻（批次 D 正式集成，替换原 FloatingCompanion 入口球） -->
    <XiaomuPet />
    <BadgeCelebration />
    <CrisisSupport />
  </div>
</template>

<script setup>
import AppNavbar from './components/AppNavbar.vue'
import AppFooter from './components/AppFooter.vue'
import BadgeCelebration from './components/BadgeCelebration.vue'
import CrisisSupport from './components/CrisisSupport.vue'
import XiaomuPet from './companion/components/XiaomuPet.vue'
</script>
