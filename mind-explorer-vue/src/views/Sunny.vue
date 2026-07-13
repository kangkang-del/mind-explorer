<template>
  <main>
    <header class="text-center mb-5">
      <h1 class="text-2xl md:text-3xl font-bold text-[#3a4a5c] m-0">☀️ 心灵晴天</h1>
      <p class="text-[#9aa6b2] mt-2 m-0">推送温馨美好的时刻：猫狗、善意的行为、美好的环境，让心里放晴。</p>
    </header>

    <!-- 分类 Tab -->
    <nav class="flex gap-2 justify-center mb-5 flex-wrap">
      <button class="px-4 py-1.5 rounded-[20px] border border-[#f0a868] bg-[#fff3e0] text-[#e07a3f] font-semibold text-[14px]">🌿 全部</button>
      <button class="px-4 py-1.5 rounded-[20px] border border-[#eef2f7] bg-white text-[#5a6b7c] text-[14px] hover:border-[#f5d2b0]">🐱 猫狗</button>
      <button class="px-4 py-1.5 rounded-[20px] border border-[#eef2f7] bg-white text-[#5a6b7c] text-[14px] hover:border-[#f5d2b0]">🤝 善意</button>
      <button class="px-4 py-1.5 rounded-[20px] border border-[#eef2f7] bg-white text-[#5a6b7c] text-[14px] hover:border-[#f5d2b0]">🌅 美好环境</button>
    </nav>

    <!-- 内容流占位 -->
    <section class="p-7 bg-[#fafbfc] border border-dashed border-[#e0e6ec] rounded-xl text-[#5a6b7c] leading-8">
      <span class="inline-block px-2.5 py-0.5 bg-[#fff3e0] text-[#e07a3f] rounded-xl text-[12px] mb-2.5">P2 待实现</span>
      <p class="m-0">此处将展示温暖内容流（形似社区，带防冷场自动推送）：</p>
      <ul class="list-disc pl-5 mt-2 space-y-1">
        <li>用户发帖（图文）+ 点赞 / 认同 + 评论</li>
        <li>每天固定自动推送：猫狗图（The Cat/Dog API）、善意文案（AI 生成）、小木语录</li>
        <li>自动推送帖带「✨ 今日晴天」标签，用户也能点赞评论</li>
        <li>首页「今日精选」从此处按优先级选取（用户 24h 内发帖 → 自动推送）</li>
      </ul>
    </section>
  </main>
</template>

<script setup>
// P2 阶段实现：内容流 + P3 自动推送
</script>
