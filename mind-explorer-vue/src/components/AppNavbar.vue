<template>
  <header class="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-[#eef2f7]">
    <div class="mx-auto max-w-app flex items-center h-[60px] px-4 md:px-6">
      <RouterLink to="/" class="flex items-center gap-1.5 font-bold text-[18px] text-[#3a4a5c] no-underline whitespace-nowrap">
        <span class="text-[22px]">🧠</span>
        <span>心灵探索</span>
      </RouterLink>

      <!-- 桌面导航 -->
      <nav class="hidden md:flex items-center gap-1 ml-auto">
        <RouterLink to="/" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">首页</RouterLink>
        <RouterLink to="/knowledge" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">了解心理学知识</RouterLink>
        <RouterLink to="/companion" class="px-3 py-2 rounded-lg text-[15px] font-semibold text-[#4a6a8a] no-underline transition hover:bg-[#eef4fa] hover:text-[#3a5a7a] relative">
          同行者
          <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#e07a3f] border-2 border-white"></span>
        </RouterLink>
        <RouterLink to="/mood" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">心情日记</RouterLink>
        <RouterLink to="/upload" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">治愈瞬间</RouterLink>
        <RouterLink to="/tools" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">自助工具</RouterLink>
        <RouterLink to="/sunny" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">心灵晴天</RouterLink>
        <RouterLink to="/feedback" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">反馈与建议</RouterLink>
        <RouterLink to="/profile" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">个人中心</RouterLink>
      </nav>

      <!-- 桌面用户头像 -->
      <div class="hidden md:block relative ml-2">
        <button class="border-0 bg-transparent cursor-pointer p-0" @click="userMenuOpen = !userMenuOpen">
          <span v-if="auth.isLoggedIn && auth.guest" class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#e0a868] to-[#f0c990] text-white text-[13px]">🏠</span>
          <img v-else-if="auth.isLoggedIn && auth.user?.avatar" :src="auth.user.avatar" class="w-9 h-9 rounded-full object-cover" />
          <span v-else-if="auth.isLoggedIn" class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white text-[13px]">🐙</span>
          <span v-else class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white text-[13px]">访客</span>
        </button>
        <div v-if="userMenuOpen" class="absolute right-0 top-[44px] min-w-[160px] bg-white border border-[#eef2f7] rounded-xl shadow-lg p-1.5 flex flex-col z-50">
          <div v-if="auth.isLoggedIn" class="px-3 py-2 text-[13px] text-[#9aa6b2] border-b border-[#eef2f7] mb-1">
            你好，{{ auth.displayName || '朋友' }}{{ auth.isGuest ? '（游客）' : '' }}
          </div>
          <RouterLink to="/profile" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">个人中心</RouterLink>
          <RouterLink to="/mood" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">心情日记</RouterLink>
          <RouterLink to="/upload" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">治愈瞬间</RouterLink>
          <RouterLink to="/tools" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">自助工具</RouterLink>
          <RouterLink to="/admin" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">审核后台</RouterLink>
          <RouterLink to="/feedback" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">反馈与建议</RouterLink>
          <button v-if="!auth.isLoggedIn" class="px-3 py-2 rounded-md text-left text-[14px] text-[#7c9cb8] font-semibold hover:bg-[#f0f4f9]" @click="openLogin()">登录 / 注册</button>
          <button v-else class="px-3 py-2 rounded-md text-left text-[14px] text-[#c97b7b] hover:bg-[#fdf2f2]" @click="auth.logout()">退出登录</button>
        </div>
      </div>

      <!-- 手机汉堡按钮（X 动画） -->
      <button
        class="md:hidden ml-auto flex flex-col justify-center gap-[5px] w-10 h-10 border-0 bg-transparent cursor-pointer relative z-[60] items-center"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        aria-label="切换菜单"
      >
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'translate-y-[7px] rotate-45': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'opacity-0': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ '-translate-y-[7px] -rotate-45': menuOpen }"></span>
      </button>
    </div>

    <!--
      手机抽屉：用 Teleport 脱离 header 的 stacking context，避免父级 backdrop-blur /
      sticky 引起的 fixed 子元素高度/层级异常；用 v-if 替代 translate 动画，更可靠。
    -->
    <Teleport to="body">
      <Transition name="drawer">
        <!-- 遮罩 -->
        <div
          v-if="menuOpen"
          class="md:hidden fixed inset-0 bg-black/45 z-[998]"
          @click="menuOpen = false"
        ></div>
      </Transition>
      <Transition name="drawer-slide">
        <!-- 抽屉主体（md 以下独占） -->
        <aside
          v-if="menuOpen"
          class="md:hidden fixed top-0 right-0 h-[100dvh] w-[84%] max-w-[340px] bg-white z-[999] shadow-[-8px_0_24px_rgba(0,0,0,0.12)] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="主菜单"
        >
          <!-- 抽屉头部 -->
          <div class="flex items-center justify-between px-5 h-[56px] border-b border-[#eef2f7] shrink-0">
            <span class="flex items-center gap-1.5 font-bold text-[16px] text-[#3a4a5c]">
              <span class="text-[20px]">🧠</span>
              心灵探索
            </span>
            <button
              class="border-0 bg-transparent text-[26px] text-[#9aa6b2] cursor-pointer w-9 h-9 -mr-2 flex items-center justify-center active:bg-[#f0f4f9] rounded-full"
              @click="menuOpen = false"
              aria-label="关闭菜单"
            >×</button>
          </div>

          <!-- 主体导航（flex-1 撑开剩余空间；min-h-0 让 overflow-y-auto 真正生效） -->
          <nav class="flex-1 min-h-0 overflow-y-auto px-2 py-2 overscroll-contain">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              @click="menuOpen = false"
              class="flex items-center min-h-[48px] px-3 py-3 rounded-xl text-[16px] text-[#5a6b7c] no-underline transition active:bg-[#e6eef5] hover:bg-[#f0f4f9]"
              active-class="bg-[#f0f4f9] text-[#3a4a5c] font-semibold"
            >
              <span class="text-[19px] mr-3 w-6 text-center shrink-0">{{ item.icon }}</span>
              <span class="flex-1">{{ item.label }}</span>
              <span
                v-if="item.highlight"
                class="ml-2 w-2 h-2 rounded-full bg-[#e07a3f] shrink-0"
                aria-label="小木新功能"
              ></span>
            </RouterLink>

            <div class="border-t border-[#eef2f7] my-3 mx-2"></div>

            <!-- 用户区 -->
            <template v-if="auth.isLoggedIn">
              <div class="px-3 py-2 text-[13px] text-[#9aa6b2]">
                你好，{{ auth.displayName || '朋友' }}{{ auth.isGuest ? '（游客）' : '' }}
              </div>
              <RouterLink
                to="/profile"
                @click="menuOpen = false"
                class="flex items-center min-h-[48px] px-3 py-3 rounded-xl text-[16px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]"
                active-class="bg-[#f0f4f9] text-[#3a4a5c] font-semibold"
              >
                <span class="text-[19px] mr-3 w-6 text-center">👤</span>个人中心
              </RouterLink>
              <RouterLink
                to="/admin"
                @click="menuOpen = false"
                class="flex items-center min-h-[48px] px-3 py-3 rounded-xl text-[16px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]"
                active-class="bg-[#f0f4f9] text-[#3a4a5c] font-semibold"
              >
                <span class="text-[19px] mr-3 w-6 text-center">🛠️</span>审核后台
              </RouterLink>
              <button
                class="w-full flex items-center min-h-[48px] px-3 py-3 rounded-xl text-left text-[16px] text-[#c97b7b] transition hover:bg-[#fdf2f2] active:bg-[#fce6e6]"
                @click="auth.logout()"
              >
                <span class="text-[19px] mr-3 w-6 text-center">🚪</span>退出登录
              </button>
            </template>
            <template v-else>
              <button
                class="w-full flex items-center min-h-[48px] px-3 py-3 rounded-xl text-left text-[16px] text-[#7c9cb8] font-semibold transition hover:bg-[#f0f4f9] active:bg-[#e6eef5]"
                @click="openLogin()"
              >
                <span class="text-[19px] mr-3 w-6 text-center">🔑</span>登录 / 注册
              </button>
            </template>
          </nav>

          <!-- iPhone 底部安全区适配，避免被 home indicator 遮挡 -->
          <div class="shrink-0 h-[env(safe-area-inset-bottom)]"></div>
        </aside>
      </Transition>
    </Teleport>

    <!-- 全局登录 / 注册弹窗 -->
    <LoginModal />
  </header>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginModal from './LoginModal.vue'

const auth = useAuthStore()
const route = useRoute()
const menuOpen = ref(false)
const userMenuOpen = ref(false)

// 主导航（移动端图标 + 同行者红点标记）
const navItems = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/knowledge', label: '了解心理学知识', icon: '📚' },
  { to: '/companion', label: '同行者', icon: '💬', highlight: true },
  { to: '/mood', label: '心情日记', icon: '☁️' },
  { to: '/upload', label: '治愈瞬间', icon: '📷' },
  { to: '/tools', label: '自助工具', icon: '🧰' },
  { to: '/sunny', label: '心灵晴天', icon: '☀️' },
  { to: '/feedback', label: '反馈与建议', icon: '✉️' },
]

function openLogin(mode = 'login') {
  userMenuOpen.value = false
  menuOpen.value = false
  auth.openLogin(mode)
}

// 路由切换时自动收起抽屉（防止跳页后抽屉仍打开导致视觉错位）
watch(() => route.fullPath, () => {
  menuOpen.value = false
  userMenuOpen.value = false
})

// 抽屉打开时锁定 body 滚动（避免背景跟着滑）
watch(menuOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

// Esc 关闭抽屉
function onKey(e) {
  if (e.key === 'Escape') {
    menuOpen.value = false
    userMenuOpen.value = false
  }
}
if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<style scoped>
/* 抽屉滑入 + 遮罩淡入（Vue Transition 类名） */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>