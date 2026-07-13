<template>
  <footer class="bg-[#f7f9fc] border-t border-[#eef2f7] text-[#7a8694] text-[14px]">
    <div class="mx-auto max-w-app px-4 md:px-6 py-8 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div class="min-w-[200px]">
        <span class="font-bold text-[#3a4a5c] text-[16px]">🧠 心灵探索</span>
        <p class="mt-1.5 text-[#9aa6b2]">用科学理解心灵，以知识温暖生活</p>
      </div>

      <div class="flex flex-wrap gap-x-5 gap-y-2">
        <RouterLink to="/knowledge" class="text-[#5a6b7c] no-underline hover:text-[#7c9cb8]">了解心理学知识</RouterLink>
        <RouterLink to="/companion" class="text-[#5a6b7c] no-underline hover:text-[#7c9cb8]">同行者</RouterLink>
        <RouterLink to="/sunny" class="text-[#5a6b7c] no-underline hover:text-[#7c9cb8]">心灵晴天</RouterLink>
        <RouterLink to="/feedback" class="text-[#5a6b7c] no-underline hover:text-[#7c9cb8]">反馈与建议</RouterLink>
      </div>

      <!-- 心理援助热线（陪伴型站点的伦理底线） -->
      <div class="bg-white border border-[#f0d8c0] rounded-xl p-2.5 flex flex-col gap-0.5 shrink-0">
        <span class="text-[12px] text-[#c8895a]">心理援助热线</span>
        <a href="tel:4001619995" class="text-[#e07a3f] font-bold text-[18px] no-underline">400-161-9995</a>
        <span class="text-[11px] text-[#b8b8b8]">（24小时·全国）</span>
      </div>
    </div>

    <div class="mx-auto max-w-app px-4 md:px-6 py-3 border-t border-[#eef2f7] flex flex-col gap-2 md:flex-row md:justify-between text-[12px] text-[#a8b2bc]">
      <span>© {{ year }} 心灵探索 Mind Explorer</span>
      <span>基于 Vue 3 · 仅用于学习交流</span>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
const year = computed(() => new Date().getFullYear())
</script>
