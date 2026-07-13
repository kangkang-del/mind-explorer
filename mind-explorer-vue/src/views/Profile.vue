<template>
  <main class="max-w-3xl mx-auto">
    <header class="mb-5">
      <h1 class="text-2xl md:text-3xl font-bold text-[#3a4a5c] m-0">👤 个人中心</h1>
    </header>

    <!-- 用户信息卡：手机列 / 平板起行 -->
    <section class="flex flex-col md:flex-row gap-4 items-center p-5 bg-white border border-[#eef2f7] rounded-2xl mb-5">
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white flex items-center justify-center text-[15px] shrink-0">访客</div>
      <div class="text-center md:text-left">
        <h2 class="text-lg font-bold text-[#3a4a5c] m-0">访客用户</h2>
        <p class="text-[#9aa6b2] text-[13px] my-1 m-0">登录后可同步收藏、对话记录与反馈</p>
        <button class="px-4 py-1.5 bg-[#7c9cb8] text-white border-0 rounded-md text-[13px] cursor-pointer hover:opacity-90">登录 / 注册</button>
      </div>
    </section>

    <!-- 功能区：手机1列 / 平板2列 -->
    <section class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl">
        <span class="text-[22px]">⭐</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">我的收藏</span>
        <span class="ml-auto text-[11px] text-[#b8b8b8] bg-[#f7f9fc] px-2 py-0.5 rounded-xl">待实现</span>
      </div>
      <div class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl">
        <span class="text-[22px]">💬</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">对话记录</span>
        <span class="ml-auto text-[11px] text-[#b8b8b8] bg-[#f7f9fc] px-2 py-0.5 rounded-xl">待实现</span>
      </div>
      <div class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl">
        <span class="text-[22px]">✉️</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">我的反馈</span>
        <span class="ml-auto text-[11px] text-[#b8b8b8] bg-[#f7f9fc] px-2 py-0.5 rounded-xl">待实现</span>
      </div>
      <div class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl">
        <span class="text-[22px]">☀️</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">我的晴天</span>
        <span class="ml-auto text-[11px] text-[#b8b8b8] bg-[#f7f9fc] px-2 py-0.5 rounded-xl">待实现</span>
      </div>
    </section>
  </main>
</template>

<script setup>
// P1 阶段接入登录系统后完善
</script>
