<template>
  <main class="max-w-3xl mx-auto">
    <header class="text-center mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-[#3a4a5c] m-0">🌿 同行者·小木</h1>
      <p class="text-[#9aa6b2] mt-2 m-0">一位温柔的心理学家和哲学家，不评判、善倾听，用通俗语言陪你聊聊。</p>
    </header>

    <!-- 小木角色卡：手机列 / 平板起行 -->
    <section class="flex flex-col md:flex-row gap-4 items-center md:items-start p-6 bg-gradient-to-br from-[#f4faf6] to-[#eef4f9] border border-[#e6efe9] rounded-2xl mb-5">
      <div class="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-[#a8d5ba] to-[#7c9cb8] flex items-center justify-center text-[34px] shrink-0">🌿</div>
      <div class="text-center md:text-left">
        <h2 class="text-xl font-bold text-[#3a4a5c] m-0">小木</h2>
        <p class="text-[#7c9cb8] text-[13px] my-1 m-0">心理学家 · 哲学家</p>
        <p class="text-[#6b7a8a] italic m-0">“你不必时时坚强，在这里可以只是你自己。”</p>
      </div>
    </section>

    <!-- 对话区占位 -->
    <section class="p-7 bg-[#fafbfc] border border-dashed border-[#e0e6ec] rounded-xl text-[#5a6b7c] leading-8">
      <span class="inline-block px-2.5 py-0.5 bg-[#e6efe9] text-[#5a8a6a] rounded-xl text-[12px] mb-2.5">P4 待实现</span>
      <p class="m-0">此处将接入 AI 对话：</p>
      <ul class="list-disc pl-5 mt-2 space-y-1">
        <li>流式对话（打字机效果）</li>
        <li>历史对话记录（按日期分组）</li>
        <li>情绪感知 + 危机干预（识别自伤倾向时弹出援助热线）</li>
        <li>每日陪伴语 · 小木语录</li>
      </ul>
    </section>
  </main>
</template>

<script setup>
// P4 阶段实现：接入大模型 API + 角色设定 + 危机干预
</script>
