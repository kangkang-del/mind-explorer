<template>
  <!--
    移动底部导航（<768 显示）。
    手册：五项固定（首页/知识/同行者/日记/工具）+ 安全区 + 页面预留高度。
    层级 90：在顶栏(100)与聊天弹窗(110)之下，高于桌宠(80)，不遮挡任何操作控件。
  -->
  <nav
    v-if="!hidden && !keyboardOpen"
    class="md:hidden fixed inset-x-0 bottom-0 z-[90] bg-white/95 backdrop-blur-md border-t border-[#E6EAF0]"
    aria-label="底部导航"
  >
    <ul class="grid grid-cols-5 m-0 p-0 list-none">
      <li v-for="tab in tabs" :key="tab.to" class="min-w-0">
        <RouterLink
          :to="tab.to"
          class="relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-1 no-underline text-[11px] leading-none transition"
          :class="isActive(tab.to) ? 'text-[#345B8E] font-semibold' : 'text-[#7a8694]'"
          :aria-current="isActive(tab.to) ? 'page' : undefined"
        >
          <span class="text-[20px] leading-none" aria-hidden="true">{{ tab.icon }}</span>
          <span class="truncate max-w-full">{{ tab.label }}</span>
          <span
            v-if="tab.highlight"
            class="absolute top-1.5 right-1/2 translate-x-[14px] w-1.5 h-1.5 rounded-full bg-[#D87945]"
            aria-hidden="true"
          ></span>
        </RouterLink>
      </li>
    </ul>
    <!-- iPhone home indicator 安全区 -->
    <div class="h-[env(safe-area-inset-bottom)]"></div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { keyboardOpen } from '../composables/useViewport'

const route = useRoute()

// 底栏豁免：后台管理是操作场景，不需要站内浏览导航，也避免误触离开。
// /companion/story 保留底栏 —— 它仍是阅读页，用户需要回首页/工具。
const HIDDEN_ON = ['/admin']
const hidden = computed(() => HIDDEN_ON.some((p) => route.path === p || route.path.startsWith(p + '/')))

// 手册：首页、知识、同行者、日记、工具
const tabs = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/knowledge', label: '知识', icon: '📚' },
  { to: '/companion', label: '同行者', icon: '💬', highlight: true },
  { to: '/mood', label: '日记', icon: '☁️' },
  { to: '/tools', label: '工具', icon: '🧰' },
]

// 用 path 精确匹配：'/' 是其余路由的前缀，用 router 的 active-class 会永远命中
function isActive(to) {
  return route.path === to
}
</script>
