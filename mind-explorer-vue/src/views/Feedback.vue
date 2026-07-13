<template>
  <main class="max-w-2xl mx-auto">
    <header class="text-center mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-[#3a4a5c] m-0">✉️ 反馈与建议</h1>
      <p class="text-[#9aa6b2] mt-2 m-0">你的每一条声音，都会让心灵探索更温暖。</p>
    </header>

    <form class="bg-white border border-[#eef2f7] rounded-2xl p-6 flex flex-col gap-4" @submit.prevent="onSubmit">
      <div class="flex flex-col gap-2">
        <span class="text-[14px] font-semibold text-[#5a6b7c]">类型</span>
        <div class="flex gap-3 flex-wrap">
          <label v-for="t in types" :key="t.value" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-[#eef2f7] rounded-[20px] cursor-pointer text-[14px] text-[#5a6b7c]">
            <input type="radio" v-model="form.type" :value="t.value" class="accent-[#7c9cb8]" />
            <span>{{ t.label }}</span>
          </label>
        </div>
      </div>

      <label class="flex flex-col gap-2">
        <span class="text-[14px] font-semibold text-[#5a6b7c]">内容</span>
        <textarea
          v-model="form.content"
          rows="5"
          placeholder="说说你的想法、遇到的问题，或想感谢的事…"
          class="w-full p-3 border border-[#e0e6ec] rounded-lg resize-y text-[14px] focus:outline-none focus:border-[#7c9cb8]"
        ></textarea>
      </label>

      <label class="flex items-center gap-2 text-[14px] text-[#5a6b7c]">
        <input type="checkbox" v-model="form.anonymous" class="accent-[#7c9cb8]" />
        <span>匿名提交</span>
      </label>

      <button
        type="submit"
        :disabled="!form.content.trim()"
        class="self-start px-7 py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white border-0 rounded-lg text-[15px] cursor-pointer transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        提交反馈
      </button>
    </form>
  </main>
</template>

<script setup>
import { reactive } from 'vue'

const types = [
  { value: 'suggest', label: '💡 建议' },
  { value: 'issue', label: '🐛 问题' },
  { value: 'thanks', label: '🙏 感谢' },
]

const form = reactive({
  type: 'suggest',
  content: '',
  anonymous: false,
})

function onSubmit() {
  // P1 阶段接入后端：netlify/functions 反馈接口
  alert(`已收到你的${form.anonymous ? '匿名' : ''}反馈（演示，尚未接入后端）`)
  form.content = ''
}
</script>
