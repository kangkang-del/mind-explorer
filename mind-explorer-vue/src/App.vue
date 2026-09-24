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
import { useAuthStore } from './stores/auth'

// 批次 M：身份必须在**应用壳层**恢复，而不是散落在各页面。
// 原来只有 Profile / Community / CardDetail / PostDetail / Upload 和已弃用的
// Navbar.vue 调用 restoreUser()，而 App.vue 挂的是 AppNavbar（不调用）——
// 结果是：在这些页面之外刷新页面，身份直接归零（登录态看起来「掉了」），
// 桌宠的 userId 也随之变空 → 对话退回纯本地记忆，服务端记忆断链。
// 在 setup 阶段同步恢复（早于任何子组件挂载）可避免「先渲染未登录、再跳回已登录」的闪动；
// 各页面原有的 restoreUser() 调用保持幂等，无需清理。
const auth = useAuthStore()
auth.restoreUser()
</script>
