<template>
  <main class="max-w-2xl mx-auto px-4 py-6">
    <div v-if="loading" class="text-center text-[#9aa6b2] py-16 m-0">加载中…</div>

    <div v-else-if="!card" class="text-center py-16">
      <p class="text-[#5a6b7c] text-[15px] m-0 mb-3">这条治愈瞬间不存在或已被移除</p>
      <RouterLink to="/upload" class="text-[#7c9cb8] no-underline font-semibold">← 返回分享页</RouterLink>
    </div>

    <article v-else class="bg-white rounded-2xl border border-[#eef2f7] p-6">
      <RouterLink to="/upload" class="inline-block text-[13px] text-[#7c9cb8] no-underline mb-4">← 返回分享页</RouterLink>

      <div class="flex items-center gap-2 mb-3">
        <span v-if="card.category" class="inline-block bg-[#f0f4f9] text-[#5a6b7c] text-[12px] px-3 py-1 rounded-full">{{ card.category }}</span>
        <span v-if="card.featured" class="inline-block bg-gradient-to-r from-[#ffe2a8] to-[#fff3d6] text-[#b4791f] text-[12px] px-3 py-1 rounded-full font-semibold border border-[#f3d28a]">✨ 精选</span>
      </div>
      <h1 class="text-2xl font-bold text-[#3a4a5c] m-0 mb-2">{{ card.title }}</h1>
      <div class="flex items-center justify-between mb-4">
        <p class="text-[13px] text-[#9aa6b2] m-0">👤 由 {{ card.author_name }} 分享</p>
        <FavoriteButton type="moment" :id="card.id" :title="card.title" :summary="(card.content||'').slice(0,80)" :link="`/user-card/${card.id}`" variant="full" />
      </div>

      <img v-if="card.image" :src="card.image" alt="配图" class="w-full rounded-xl mb-4 object-cover max-h-[360px]" />

      <p class="text-[15px] text-[#3a4a5c] leading-8 whitespace-pre-wrap m-0">{{ card.content }}</p>

      <p v-if="card.source" class="text-[13px] text-[#9aa6b2] mt-4 m-0">来源：{{ card.source }}</p>

      <p v-if="card.status !== 'approved'" class="text-[13px] text-[#b08968] mt-4 m-0">
        状态：{{ statusText(card.status) }}（通过后将展示在社区里）
      </p>

      <!-- 互动：抱抱 + 举报 -->
      <div class="flex items-center gap-3 mt-5 pt-4 border-t border-[#f0f4f9]">
        <button
          @click="onHug"
          :disabled="hugging"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border transition"
          :class="hugged ? 'bg-gradient-to-r from-[#f0b0b0] to-[#f7c9c9] text-white border-transparent' : 'bg-white text-[#c97b7b] border-[#f0c9c9] hover:bg-[#fff4f4]'"
        >
          🤗 {{ hugged ? '已抱抱' : '抱抱' }} {{ hugs > 0 ? hugs : '' }}
        </button>
        <button
          @click="reportOpen = true"
          class="ml-auto text-[13px] text-[#9aa6b2] hover:text-[#e07a3f] transition"
        >
          ⚠️ 举报
        </button>
      </div>
    </article>

    <ReportDialog
      :open="reportOpen"
      target-type="user_card"
      :target-id="card ? card.id : ''"
      @close="reportOpen = false"
      @submitted="onReported"
    />
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { userCardsApi } from '../../api/userCards'
import { reportsApi } from '../../api/reports'
import { useAuthStore } from '../../stores/auth'
import FavoriteButton from '../../components/FavoriteButton.vue'
import ReportDialog from '../../components/ReportDialog.vue'

const props = defineProps({ id: String })
const auth = useAuthStore()
const card = ref(null)
const loading = ref(true)
const hugs = ref(0)
const hugged = ref(false)
const hugging = ref(false)
const reportOpen = ref(false)

function statusText(s) {
  return { pending: '审核中', approved: '已通过', rejected: '已拒绝' }[s] || s
}
function uidOf() {
  const u = auth.currentUser
  if (!u) return null
  return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
}

async function onHug() {
  if (hugging.value) return
  const uid = uidOf()
  if (!uid) {
    alert('请先登录或成为游客后再抱抱 🤗')
    return
  }
  hugging.value = true
  const before = hugged.value
  hugged.value = !before
  hugs.value += before ? -1 : 1
  try {
    const r = await userCardsApi.toggleHug(props.id, uid, auth.currentUser.type)
    hugs.value = r.count
    hugged.value = r.hugged
  } catch (e) {
    hugged.value = before
    hugs.value += before ? 1 : -1
    alert('抱抱失败：' + (e.message || '请稍后再试'))
  } finally {
    hugging.value = false
  }
}

function onReported() {
  reportOpen.value = false
  alert('已收到你的举报，我们会尽快核实，谢谢你的守护 💛')
}

onMounted(async () => {
  try {
    card.value = await userCardsApi.getById(props.id)
    hugs.value = card.value?.hugs || 0
    const u = auth.currentUser
    if (u && card.value) {
      const uid = uidOf()
      const liked = await userCardsApi.myHugs([card.value.id], uid).catch(() => [])
      hugged.value = Array.isArray(liked) && liked.includes(card.value.id)
    }
  } catch (e) {
    card.value = null
  } finally {
    loading.value = false
  }
})
</script>
