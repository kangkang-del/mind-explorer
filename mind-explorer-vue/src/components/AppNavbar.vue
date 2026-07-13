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
          <RouterLink to="/feedback" class="px-3 py-2 rounded-md text-[14px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]" @click="userMenuOpen=false">反馈与建议</RouterLink>
          <button class="px-3 py-2 rounded-md text-left text-[14px] text-[#7c9cb8] font-semibold hover:bg-[#f0f4f9]" @click="userMenuOpen=false">登录 / 注册</button>
        </div>
      </div>

      <!-- 手机汉堡按钮 -->
      <button class="md:hidden ml-auto flex flex-col justify-center gap-[5px] w-9 h-9 border-0 bg-transparent cursor-pointer" @click="menuOpen = !menuOpen" aria-label="切换菜单">
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'translate-y-[7px] rotate-45': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ 'opacity-0': menuOpen }"></span>
        <span class="block w-[22px] h-0.5 bg-[#5a6b7c] rounded transition-all duration-300" :class="{ '-translate-y-[7px] -rotate-45': menuOpen }"></span>
      </button>
    </div>

    <!-- 手机抽屉菜单 -->
    <div class="md:hidden overflow-hidden transition-all duration-300 border-[#eef2f7]" :class="menuOpen ? 'max-h-[480px] border-t' : 'max-h-0'">
      <nav class="flex flex-col px-4 py-2">
        <RouterLink to="/" @click="menuOpen=false" class="px-3 py-3 rounded-md text-[15px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]">首页</RouterLink>
        <RouterLink to="/knowledge" @click="menuOpen=false" class="px-3 py-3 rounded-md text-[15px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]">了解心理学知识</RouterLink>
        <RouterLink to="/companion" @click="menuOpen=false" class="px-3 py-3 rounded-md text-[15px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]">同行者</RouterLink>
        <RouterLink to="/sunny" @click="menuOpen=false" class="px-3 py-3 rounded-md text-[15px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]">心灵晴天</RouterLink>
        <RouterLink to="/feedback" @click="menuOpen=false" class="px-3 py-3 rounded-md text-[15px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]">反馈与建议</RouterLink>
        <div class="border-t border-[#eef2f7] my-1"></div>
        <RouterLink to="/profile" @click="menuOpen=false" class="px-3 py-3 rounded-md text-[15px] text-[#5a6b7c] no-underline hover:bg-[#f0f4f9]">个人中心</RouterLink>
        <button class="px-3 py-3 rounded-md text-left text-[15px] text-[#7c9cb8] font-semibold hover:bg-[#f0f4f9]">登录 / 注册</button>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'
const menuOpen = ref(false)
const userMenuOpen = ref(false)
</script>
