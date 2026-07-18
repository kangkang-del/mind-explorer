<template>
  <main class="max-w-2xl mx-auto px-4 py-6">
    <div v-if="loading" class="text-center text-[#9aa6b2] py-16 m-0">加载中…</div>

    <div v-else-if="!card" class="text-center py-16">
      <p class="text-[#5a6b7c] text-[15px] m-0 mb-3">这条治愈瞬间不存在或已被移除</p>
      <RouterLink to="/upload" class="text-[#7c9cb8] no-underline font-semibold">← 返回分享页</RouterLink>
    </div>

    <article v-else class="bg-white rounded-2xl border border-[#eef2f7] p-6">
      <RouterLink to="/upload" class="inline-block text-[13px] text-[#7c9cb8] no-underline mb-4">← 返回分享页</RouterLink>

      <span v-if="card.category" class="inline-block bg-[#f0f4f9] text-[#5a6b7c] text-[12px] px-3 py-1 rounded-full mb-3">{{ card.category }}</span>
      <h1 class="text-2xl font-bold text-[#3a4a5c] m-0 mb-2">{{ card.title }}</h1>
      <p class="text-[13px] text-[#9aa6b2] m-0 mb-4">👤 由 {{ card.author_name }} 分享</p>

      <img v-if="card.image" :src="card.image" alt="配图" class="w-full rounded-xl mb-4 object-cover max-h-[360px]" />

      <p class="text-[15px] text-[#3a4a5c] leading-8 whitespace-pre-wrap m-0">{{ card.content }}</p>

      <p v-if="card.source" class="text-[13px] text-[#9aa6b2] mt-4 m-0">来源：{{ card.source }}</p>

      <p v-if="card.status !== 'approved'" class="text-[13px] text-[#b08968] mt-4 m-0">
        状态：{{ statusText(card.status) }}（通过后将展示在社区里）
      </p>
    </article>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { userCardsApi } from '../../api/userCards'

const props = defineProps({ id: String })
const card = ref(null)
const loading = ref(true)

function statusText(s) {
  return { pending: '审核中', approved: '已通过', rejected: '已拒绝' }[s] || s
}

onMounted(async () => {
  try {
    card.value = await userCardsApi.getById(props.id)
  } catch (e) {
    card.value = null
  } finally {
    loading.value = false
  }
})
</script>
