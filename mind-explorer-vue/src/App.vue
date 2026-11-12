<template>
  <!-- 手机端给固定底栏留出 64px + 安全区，避免页脚被压在底栏下面 -->
  <div class="flex min-h-screen flex-col bg-[#FAFBFD] md:bg-[#F2F0E8] pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
    <AppNavbar />
    <!-- 页面级容器的唯一来源：宽 1200 + 水平留白。
         各 view 只按手册选 page-wide / page-read / page-narrow，
         不得再自带 px-*，否则手机端会双重留白（390 下内容只剩 326）。 -->
    <main class="flex-1 w-full page-wide page-x py-6 md:py-8">
      <RouterView />
    </main>
    <AppFooter />
    <!-- 移动底部导航：<768 显示，为它预留高度，避免盖住页脚 -->
    <AppTabbar />
    <!-- M1 小木桌宠：全站常驻（批次 D 正式集成，替换原 FloatingCompanion 入口球） -->
    <XiaomuPet v-if="prefs.petOn" />
    <BadgeCelebration />
    <CrisisSupport />
  </div>
</template>

<script setup>
import AppNavbar from './components/AppNavbar.vue'
import AppFooter from './components/AppFooter.vue'
import AppTabbar from './components/AppTabbar.vue'
import BadgeCelebration from './components/BadgeCelebration.vue'
import CrisisSupport from './components/CrisisSupport.vue'
import XiaomuPet from './companion/components/XiaomuPet.vue'
import { useAuthStore } from './stores/auth'
import { bindViewport } from './composables/useViewport'
import { useXiaomuPrefs } from './companion/composables/useXiaomuPrefs'

// 批次 M：身份必须在**应用壳层**恢复，而不是散落在各页面。
// 原来只有 Profile / Community / CardDetail / PostDetail / Upload 和已弃用的
// Navbar.vue 调用 restoreUser()，而 App.vue 挂的是 AppNavbar（不调用）——
// 结果是：在这些页面之外刷新页面，身份直接归零（登录态看起来「掉了」），
// 桌宠的 userId 也随之变空 → 对话退回纯本地记忆，服务端记忆断链。
// 在 setup 阶段同步恢复（早于任何子组件挂载）可避免「先渲染未登录、再跳回已登录」的闪动；
// 各页面原有的 restoreUser() 调用保持幂等，无需清理。
const auth = useAuthStore()
auth.restoreUser()

// 桌宠默认不挂载（prefs.petOn 默认 false）：手册要求小木不默认全局悬浮。
// 不挂载比 display:none 干净 —— 主动搭话的定时器与手势监听都不会启动。
const prefs = useXiaomuPrefs()

// 视口/键盘监听全局只绑一次：底部导航与聊天页共用同一份状态
bindViewport()
</script>
