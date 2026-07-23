<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
      @click.self="$emit('close')"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold text-[#3a4a5c] m-0">⚠️ 举报内容</h3>
          <button @click="$emit('close')" class="text-[#9aa6b2] text-[18px] leading-none hover:text-[#5a6b7c]">✕</button>
        </div>
        <p class="text-[13px] text-[#9aa6b2] m-0 mb-4">感谢你帮助维护温暖安全的社区。我们会尽快核实处理。</p>

        <p class="text-[13px] text-[#5a6b7c] font-semibold mb-2 m-0">请选择举报理由</p>
        <div class="flex flex-wrap gap-2 mb-4">
          <button
            v-for="r in reasons"
            :key="r"
            @click="reason = r"
            class="px-3 py-1.5 rounded-full text-[13px] border transition"
            :class="reason === r ? 'border-[#e07a3f] bg-[#fff4ec] text-[#d2691e]' : 'border-[#eef2f7] text-[#9aa6b2] hover:border-[#c5d8ea]'"
          >
            {{ r }}
          </button>
        </div>

        <textarea
          v-model="detail"
          rows="3"
          maxlength="300"
          placeholder="补充说明（选填）"
          class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] resize-y focus:outline-none focus:border-[#7c9cb8] mb-1"
        ></textarea>
        <p class="text-right text-[12px] text-[#b9c4cf] m-0 mb-4">{{ detail.length }}/300</p>

        <div class="flex gap-2">
          <button
            @click="submit"
            :disabled="!reason || submitting"
            class="flex-1 py-2.5 bg-gradient-to-r from-[#e07a3f] to-[#f0a868] text-white rounded-lg text-[14px] font-semibold disabled:opacity-50 hover:opacity-90 transition"
          >
            {{ submitting ? '提交中…' : '提交举报' }}
          </button>
          <button
            @click="$emit('close')"
            class="px-4 py-2.5 rounded-lg text-[14px] text-[#5a6b7c] border border-[#e0e6ec] hover:bg-[#f0f4f9] transition"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { reportsApi } from '../api/reports'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  open: { type: Boolean, default: false },
  targetType: { type: String, required: true }, // 'user_card' | 'community_post'
  targetId: { type: [String, Number], default: '' },
})
const emit = defineEmits(['close', 'submitted'])

const auth = useAuthStore()
const reasons = ['辱骂攻击', '垃圾广告', '不实信息', '自伤风险', '其他']
const reason = ref('')
const detail = ref('')
const submitting = ref(false)

function uidOf() {
  const u = auth.currentUser
  if (!u) return { id: null, type: null }
  return u.type === 'github'
    ? { id: `gh:${u.username}`, type: 'github' }
    : { id: `g:${u.id}`, type: 'guest' }
}

async function submit() {
  if (!reason.value || submitting.value) return
  submitting.value = true
  const { id, type } = uidOf()
  try {
    await reportsApi.submit({
      targetType: props.targetType,
      targetId: String(props.targetId),
      reporterId: id,
      reporterType: type,
      reason: reason.value,
      detail: detail.value,
    })
    reason.value = ''
    detail.value = ''
    emit('submitted')
  } catch (e) {
    alert('举报失败：' + (e.message || '请稍后再试'))
  } finally {
    submitting.value = false
  }
}
</script>
