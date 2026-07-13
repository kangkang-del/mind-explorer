<template>
  <main>
    <!-- Hero 区 -->
    <section class="text-center py-12 md:py-14 lg:py-16">
      <span class="inline-block px-3 py-1 bg-[#eef4f9] text-[#7c9cb8] rounded-[20px] text-[13px] mb-4">🌱 用科学理解心灵</span>
      <h1 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#3a4a5c] leading-snug">
        用科学理解心灵<br />
        <span class="bg-gradient-to-r from-[#7c9cb8] to-[#f0a868] bg-clip-text text-transparent">以知识温暖生活</span>
      </h1>
      <p class="mt-3.5 text-[#9aa6b2] text-base md:text-lg">此刻，允许自己只是存在。</p>
    </section>

    <!-- 四大入口：手机1列 / 平板2列 / 桌面4列 -->
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <RouterLink to="/knowledge" class="flex flex-col gap-1.5 p-5 md:p-6 bg-white border border-[#eef2f7] rounded-2xl no-underline transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:border-[#c5d8ea]">
        <span class="text-[28px]">📚</span>
        <span class="text-[17px] font-bold text-[#3a4a5c]">了解心理学知识</span>
        <span class="text-[13px] text-[#9aa6b2]">知识卡片 · 心理疾病科普 · 心理学家 · 经典实验</span>
      </RouterLink>

      <RouterLink to="/companion" class="flex flex-col gap-1.5 p-5 md:p-6 bg-white border border-[#eef2f7] rounded-2xl no-underline transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:border-[#bfe0cb]">
        <span class="text-[28px]">🌿</span>
        <span class="text-[17px] font-bold text-[#3a4a5c]">同行者·小木</span>
        <span class="text-[13px] text-[#9aa6b2]">一位温柔的心理学家和哲学家，随时陪你聊聊</span>
      </RouterLink>

      <RouterLink to="/sunny" class="flex flex-col gap-1.5 p-5 md:p-6 bg-white border border-[#eef2f7] rounded-2xl no-underline transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:border-[#f5d2b0]">
        <span class="text-[28px]">☀️</span>
        <span class="text-[17px] font-bold text-[#3a4a5c]">心灵晴天</span>
        <span class="text-[13px] text-[#9aa6b2]">猫狗 · 善意行为 · 美好环境，推送温暖时刻</span>
      </RouterLink>

      <RouterLink to="/feedback" class="flex flex-col gap-1.5 p-5 md:p-6 bg-white border border-[#eef2f7] rounded-2xl no-underline transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] hover:border-[#d8c9e8]">
        <span class="text-[28px]">✉️</span>
        <span class="text-[17px] font-bold text-[#3a4a5c]">反馈与建议</span>
        <span class="text-[13px] text-[#9aa6b2]">告诉我们你的想法，让心灵探索更好</span>
      </RouterLink>
    </section>

    <!-- 今日精选（P2 心灵晴天阶段接入真实数据） -->
    <section class="mt-8 md:mt-10">
      <h2 class="text-xl md:text-2xl font-bold text-[#3a4a5c] mb-3">今日精选</h2>
      <p class="p-6 bg-[#fafbfc] border border-dashed border-[#e0e6ec] rounded-xl text-[#9aa6b2] text-[14px] leading-7 m-0">
        ☀️ 此处将展示「心灵晴天」每日精选流 —— 用户 24 小时内发布的内容优先，不足时由系统自动推送温暖内容补位。
      </p>
    </section>
  </main>
</template>

<script setup>
// P0 首页占位：Hero + 四大入口 + 今日精选预留位
</script>
