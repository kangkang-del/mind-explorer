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
        <RouterLink to="/companion" class="px-3 py-2 rounded-lg text-[15px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9] hover:text-[#3a4a5c]">同行者</RouterLink>
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
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white text-[13px]">访客</span>
        </button>
        <div v-if="userMenuOpen" class="absolute right-0 top-[44px] min-w-[160px] bg-white border border-[#eef2f7] rounded-xl shadow-lg p-1.5 flex flex-col z-50">
          <RouterLink to="/profile" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">个人中心</RouterLink>
          <RouterLink to="/mood" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">心情日记</RouterLink>
          <RouterLink to="/upload" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">治愈瞬间</RouterLink>
          <RouterLink to="/tools" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">自助工具</RouterLink>
          <RouterLink to="/admin" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">审核后台</RouterLink>
          <RouterLink to="/feedback" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">反馈与建议</RouterLink>
          <button class="px-3 py-2 rounded-md text-left text-[14px] text-[#7c9cb8] font-semibold hover:bg-[#f0f4f9]" @click="userMenuOpen=false">登录 / 注册</button>
        </div>
      </div>

      <!-- 手机汉堡按钮（三横线 → X 动画） -->
      <button
        class="md:hidden ml-auto flex flex-col justify-center gap-[5px] w-9 h-9 border-0 bg-transparent cursor-pointer relative z-[60]"
        @click="menuOpen = !menuOpen"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        aria-label="切换菜单"
      >
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'translate-y-[7px] rotate-45': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'opacity-0': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ '-translate-y-[7px] -rotate-45': menuOpen }"></span>
      </button>
    </div>

    <!-- 手机遮罩 -->
    <div
      class="md:hidden fixed inset-0 bg-black/40 z-[55] transition-opacity duration-300"
      :class="menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      @click="menuOpen = false"
    ></div>

    <!-- 手机右侧滑入抽屉 -->
    <aside
      class="md:hidden fixed top-0 right-0 h-full w-[80%] max-w-[320px] bg-white z-[56] shadow-2xl transition-transform duration-300 ease-out flex flex-col"
      :class="menuOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <div class="flex items-center justify-between px-5 h-[60px] border-b border-[#eef2f7] shrink-0">
        <span class="font-bold text-[17px] text-[#3a4a5c]">心灵探索</span>
        <button class="border-0 bg-transparent text-[26px] text-[#9aa6b2] cursor-pointer leading-none" @click="menuOpen = false" aria-label="关闭菜单">×</button>
      </div>
      <nav class="flex flex-col px-3 py-2 overflow-y-auto">
        <RouterLink to="/" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">首页</RouterLink>
        <RouterLink to="/knowledge" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">了解心理学知识</RouterLink>
        <RouterLink to="/companion" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">同行者</RouterLink>
        <RouterLink to="/mood" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">心情日记</RouterLink>
        <RouterLink to="/upload" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">治愈瞬间</RouterLink>
        <RouterLink to="/tools" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">自助工具</RouterLink>
        <RouterLink to="/sunny" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">心灵晴天</RouterLink>
        <RouterLink to="/feedback" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">反馈与建议</RouterLink>
        <div class="border-t border-[#eef2f7] my-2"></div>
        <RouterLink to="/profile" @click="menuOpen=false" class="px-3 py-3.5 rounded-lg text-[16px] text-[#5a6b7c] no-underline transition hover:bg-[#f0f4f9]">个人中心</RouterLink>
        <button class="px-3 py-3.5 rounded-lg text-left text-[16px] text-[#7c9cb8] font-semibold transition hover:bg-[#f0f4f9]" @click="menuOpen=false">登录 / 注册</button>
      </nav>
    </aside>
  </header>
</template>

<script setup>
import { ref } from 'vue'
const menuOpen = ref(false)
const userMenuOpen = ref(false)
</script>
