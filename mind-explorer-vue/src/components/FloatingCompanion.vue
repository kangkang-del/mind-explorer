<template>
  <RouterLink
    to="/companion"
    class="fixed right-5 bottom-6 z-[90] flex items-center gap-2.5 pl-2 pr-3.5 py-2 bg-white border border-[#e6efe9] rounded-[40px] shadow-[0_6px_20px_rgba(124,156,184,0.18)] no-underline transition hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(124,156,184,0.28)]"
    aria-label="与同行者小木对话"
  >
    <div class="relative w-10 h-10 rounded-full bg-gradient-to-br from-[#a8d5ba] to-[#7c9cb8] flex items-center justify-center shrink-0">
      <span class="text-[20px]">🌿</span>
      <span class="absolute inset-0 rounded-full border-2 border-[#a8d5ba] floating-ring"></span>
    </div>
    <div class="hidden md:flex flex-col leading-tight">
      <span class="text-[14px] font-bold text-[#3a4a5c]">小木</span>
      <span class="text-[11px] text-[#9aa6b2]">随时陪你聊聊</span>
    </div>
  </RouterLink>
</template>

<script setup>
// 右下角常驻入口：任何页面都能一键唤起同行者小木
</script>

<style scoped>
@keyframes floating-ring {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(1.6); opacity: 0; }
}
.floating-ring { animation: floating-ring 2.2s ease-out infinite; }
</style>
