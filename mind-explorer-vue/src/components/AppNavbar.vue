<template>
  <header class="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-[#E6EAF0]">
    <div class="mx-auto max-w-app flex items-center h-[60px] page-x gap-2">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-1.5 min-h-[44px] font-bold text-[18px] text-[#263746] no-underline whitespace-nowrap"
      >
        <span class="text-[22px]">🧠</span>
        <span>心灵探索</span>
      </RouterLink>

      <!-- ===== 桌面导航：≥1024，9 项单行 ===== -->
      <nav class="hidden xl:flex items-center gap-1 ml-auto" aria-label="主导航">
        <RouterLink
          v-for="item in desktopNav"
          :key="item.to"
          :to="item.to"
          class="relative inline-flex items-center px-3 min-h-[44px] rounded-lg text-[15px] no-underline whitespace-nowrap transition"
          :class="isActive(item.to) ? 'bg-[#f0f4f9] text-[#263746] font-semibold' : 'text-[#5a6b7c] hover:bg-[#f0f4f9] hover:text-[#263746]'"
        >
          {{ item.label }}
          <span
            v-if="item.highlight"
            class="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-[#D87945]"
            aria-label="小木新功能"
          ></span>
        </RouterLink>
      </nav>

      <!-- ===== 平板导航：768–1023，5 个核心入口单行 ===== -->
      <nav class="hidden md:flex xl:hidden items-center gap-0.5 ml-auto" aria-label="主导航">
        <RouterLink
          v-for="item in tabletNav"
          :key="item.to"
          :to="item.to"
          class="relative inline-flex items-center px-2.5 min-h-[44px] rounded-lg text-[15px] no-underline whitespace-nowrap transition"
          :class="isActive(item.to) ? 'bg-[#f0f4f9] text-[#263746] font-semibold' : 'text-[#5a6b7c] hover:bg-[#f0f4f9] hover:text-[#263746]'"
        >
          {{ item.label }}
          <span
            v-if="item.highlight"
            class="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-[#D87945]"
            aria-label="小木新功能"
          ></span>
        </RouterLink>
      </nav>

      <!-- ===== 手机：汉堡 ===== -->
      <button
        class="md:hidden ml-auto flex flex-col justify-center gap-[5px] w-11 h-11 border-0 bg-transparent cursor-pointer relative z-[60] items-center"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        aria-label="切换菜单"
      >
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'translate-y-[7px] rotate-45': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'opacity-0': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ '-translate-y-[7px] -rotate-45': menuOpen }"></span>
      </button>

      <!-- ===== 平板：更多（打开同一抽屉） ===== -->
      <button
        class="hidden md:inline-flex xl:hidden items-center min-h-[44px] px-2.5 rounded-lg text-[15px] text-[#5a6b7c] bg-transparent border-0 cursor-pointer transition hover:bg-[#f0f4f9] hover:text-[#263746]"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        aria-label="更多入口"
      >
        更多
        <span class="ml-0.5 text-[10px]">▾</span>
      </button>

      <!-- ===== 用户头像（≥768） ===== -->
      <div class="hidden md:block relative">
        <button
          class="border-0 bg-transparent cursor-pointer p-0 w-11 h-11 inline-flex items-center justify-center"
          @click="userMenuOpen = !userMenuOpen"
          aria-label="用户菜单"
          :aria-expanded="userMenuOpen ? 'true' : 'false'"
        >
          <span v-if="auth.isLoggedIn && auth.guest" class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#e0a868] to-[#f0c990] text-white text-[13px]">🏠</span>
          <img v-else-if="auth.isLoggedIn && auth.user?.avatar" :src="auth.user.avatar" class="w-9 h-9 rounded-full object-cover" />
          <span v-else-if="auth.isLoggedIn" class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#7c9cb8] bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white text-[13px]">🐙</span>
          <span v-else class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#7c9cb8] bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white text-[13px]">访客</span>
        </button>
        <div v-if="userMenuOpen" class="absolute right-0 top-[46px] min-w-[160px] bg-white border border-[#E6EAF0] rounded-xl shadow-lg p-1.5 flex flex-col z-50">
          <div v-if="auth.isLoggedIn" class="px-3 py-2 text-[13px] text-[#5A6B7C] border-b border-[#E6EAF0] mb-1">
            你好，{{ auth.displayName || '朋友' }}{{ auth.isGuest ? '（游客）' : '' }}
          </div>
          <RouterLink to="/profile" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">个人中心</RouterLink>
          <RouterLink to="/mood" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">心情日记</RouterLink>
          <RouterLink to="/upload" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">治愈瞬间</RouterLink>
          <RouterLink to="/tools" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">自助工具</RouterLink>
          <RouterLink to="/admin" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">审核后台</RouterLink>
          <RouterLink to="/feedback" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">反馈与建议</RouterLink>
          <button v-if="!auth.isLoggedIn" class="inline-flex items-center min-h-[44px] px-3 rounded-md text-left text-[14px] text-[#7c9cb8] font-semibold bg-transparent border-0 cursor-pointer hover:bg-[#f0f4f9]" @click="openLogin()">登录 / 注册</button>
          <button v-else class="inline-flex items-center min-h-[44px] px-3 rounded-md text-left text-[14px] text-[#c97b7b] bg-transparent border-0 cursor-pointer hover:bg-[#fdf2f2]" @click="auth.logout()">退出登录</button>
        </div>
      </div>
    </div>

    <!--
      抽屉：<1024 共用（手机从汉堡开、平板从「更多」开）。
      用 Teleport 脱离 header 的 stacking context，避免父级 backdrop-blur 与
      sticky 引起的 fixed 子元素高度和层级异常。
    -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="menuOpen"
          class="xl:hidden fixed inset-0 bg-black/45 z-[899]"
          @click="menuOpen = false"
        ></div>
      </Transition>
      <Transition name="drawer-slide">
        <aside
          v-if="menuOpen"
          class="xl:hidden fixed top-0 right-0 h-[100dvh] w-[84%] max-w-[340px] bg-white z-[900] shadow-[-8px_0_24px_rgba(0,0,0,0.12)] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="主菜单"
        >
          <div class="flex items-center justify-between px-5 h-[56px] border-b border-[#E6EAF0] shrink-0">
            <span class="flex items-center gap-1.5 font-bold text-[16px] text-[#263746]">
              <span class="text-[20px]">🧠</span>
              心灵探索
            </span>
            <button
              class="border-0 bg-transparent text-[26px] text-[#5A6B7C] cursor-pointer w-11 h-11 -mr-2 flex items-center justify-center active:bg-[#f0f4f9] rounded-full"
              @click="menuOpen = false"
              aria-label="关闭菜单"
            >×</button>
          </div>

          <nav class="flex-1 min-h-0 overflow-y-auto px-2 py-2 overscroll-contain">
            <RouterLink
              v-for="item in drawerNav"
              :key="item.to"
              :to="item.to"
              @click="menuOpen = false"
              class="flex items-center min-h-[48px] px-3 py-3 rounded-xl text-[16px] text-[#5a6b7c] no-underline transition active:bg-[#e6eef5] hover:bg-[#f0f4f9]"
              active-class="bg-[#f0f4f9] text-[#263746] font-semibold"
            >
              <span class="text-[19px] mr-3 w-6 text-center shrink-0">{{ item.icon }}</span>
              <span class="flex-1">{{ item.label }}</span>
              <span
                v-if="item.highlight"
                class="ml-2 w-2 h-2 rounded-full bg-[#D87945] shrink-0"
                aria-label="小木新功能"
              ></span>
            </RouterLink>

            <div class="border-t border-[#E6EAF0] my-3 mx-2"></div>

            <template v-if="auth.isLoggedIn">
              <div class="px-3 py-2 text-[13px] text-[#5A6B7C]">
                你好，{{ auth.displayName || '朋友' }}{{ auth.isGuest ? '（游客）' : '' }}
              </div>
              <RouterLink
                to="/profile"
                @click="menuOpen = false"
                class="flex items-center min-h-[48px] px-3 py-3 rounded-xl text-[16px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]"
                active-class="bg-[#f0f4f9] text-[#263746] font-semibold"
              >
                <span class="text-[19px] mr-3 w-6 text-center">👤</span>个人中心
              </RouterLink>
              <RouterLink
                to="/admin"
                @click="menuOpen = false"
                class="flex items-center min-h-[48px] px-3 py-3 rounded-xl text-[16px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]"
                active-class="bg-[#f0f4f9] text-[#263746] font-semibold"
              >
                <span class="text-[19px] mr-3 w-6 text-center">🛠️</span>审核后台
              </RouterLink>
              <button
                class="w-full flex items-center min-h-[48px] px-3 py-3 rounded-xl text-left text-[16px] text-[#c97b7b] bg-transparent border-0 cursor-pointer transition hover:bg-[#fdf2f2] active:bg-[#fce6e6]"
                @click="auth.logout()"
              >
                <span class="text-[19px] mr-3 w-6 text-center">🚪</span>退出登录
              </button>
            </template>
            <template v-else>
              <button
                class="w-full flex items-center min-h-[48px] px-3 py-3 rounded-xl text-left text-[16px] text-[#7c9cb8] font-semibold bg-transparent border-0 cursor-pointer transition hover:bg-[#f0f4f9] active:bg-[#e6eef5]"
                @click="openLogin()"
              >
                <span class="text-[19px] mr-3 w-6 text-center">🔑</span>登录 / 注册
              </button>
            </template>
          </nav>

          <div class="shrink-0 h-[env(safe-area-inset-bottom)]"></div>
        </aside>
      </Transition>
    </Teleport>

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

// 桌面（≥1024）：沿用现有 9 个入口，文字不缩写
const desktopNav = [
  { to: '/', label: '首页' },
  { to: '/knowledge', label: '了解心理学知识' },
  { to: '/companion', label: '同行者', highlight: true },
  { to: '/mood', label: '心情日记' },
  { to: '/upload', label: '治愈瞬间' },
  { to: '/tools', label: '自助工具' },
  { to: '/sunny', label: '心灵晴天' },
  { to: '/feedback', label: '反馈与建议' },
  { to: '/profile', label: '个人中心' },
]

// 平板（768–1023）：手册规定的五个核心入口，标签取短名，保证单行
const tabletNav = [
  { to: '/', label: '首页' },
  { to: '/companion', label: '同行者', highlight: true },
  { to: '/knowledge', label: '知识' },
  { to: '/mood', label: '日记' },
  { to: '/tools', label: '工具' },
]

// 抽屉（<1024）：全量入口，低频项也在这里
const drawerNav = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/knowledge', label: '了解心理学知识', icon: '📚' },
  { to: '/companion', label: '同行者', icon: '💬', highlight: true },
  { to: '/mood', label: '心情日记', icon: '☁️' },
  { to: '/upload', label: '治愈瞬间', icon: '📷' },
  { to: '/tools', label: '自助工具', icon: '🧰' },
  { to: '/sunny', label: '心灵晴天', icon: '☀️' },
  { to: '/feedback', label: '反馈与建议', icon: '✉️' },
]

// 用 path 精确判断选中：'/' 用 active-class 会命中所有路由
function isActive(to) {
  return route.path === to
}

function openLogin(mode = 'login') {
  userMenuOpen.value = false
  menuOpen.value = false
  auth.openLogin(mode)
}

watch(() => route.fullPath, () => {
  menuOpen.value = false
  userMenuOpen.value = false
})

watch(menuOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

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
