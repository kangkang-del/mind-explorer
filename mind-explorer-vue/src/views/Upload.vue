<template>
  <main class="max-w-3xl mx-auto px-4 py-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-[#3a4a5c] m-0">🌱 分享治愈瞬间</h1>
      <p class="text-[#9aa6b2] text-[14px] mt-1 m-0">
        这里收集彼此生命里微小的光。提交后会经小木团队审核，通过即出现在社区「用户贡献」里。
      </p>
      <RouterLink to="/study" class="inline-block text-[13px] text-[#7c9cb8] no-underline mt-1 hover:underline">看看大家分享的治愈瞬间 →</RouterLink>
    </header>

    <!-- 未登录 -->
    <section v-if="!auth.isLoggedIn" class="bg-white rounded-2xl border border-[#eef2f7] p-8 text-center">
      <p class="text-[#5a6b7c] text-[15px] m-0 mb-4">登录后即可分享你的治愈瞬间</p>
      <button
        @click="auth.login()"
        class="px-6 py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-xl text-[14px] font-semibold hover:opacity-90 transition"
      >
        登录 / 注册
      </button>
    </section>

    <!-- 投稿表单 -->
    <section v-else class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-[14px] text-[#5a6b7c] mb-1.5">标题 *</label>
          <input
            v-model="form.title"
            maxlength="60"
            placeholder="一句话概括这个瞬间，如：楼下小猫今天蹭了蹭我"
            class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] focus:outline-none focus:border-[#7c9cb8]"
          />
        </div>

        <div>
          <label class="block text-[14px] text-[#5a6b7c] mb-1.5">分类</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in categories"
              :key="c"
              type="button"
              @click="form.category = c"
              class="px-3 py-1.5 rounded-full text-[13px] border transition"
              :class="form.category === c ? 'border-[#7c9cb8] bg-[#f0f4f9] text-[#3a4a5c]' : 'border-[#eef2f7] text-[#9aa6b2] hover:border-[#c5d8ea]'"
            >
              {{ c }}
            </button>
          </div>
        </div>

        <div>
          <label class="block text-[14px] text-[#5a6b7c] mb-1.5">这一刻 *</label>
          <textarea
            v-model="form.content"
            rows="6"
            maxlength="2000"
            placeholder="慢慢写下来吧，发生了什么、你当时的心情、它为什么打动了你……"
            class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] resize-y focus:outline-none focus:border-[#7c9cb8]"
          ></textarea>
          <p class="text-right text-[12px] text-[#b9c4cf] m-0 mt-1">{{ form.content.length }}/2000</p>
        </div>

        <div>
          <label class="block text-[14px] text-[#5a6b7c] mb-1.5">配图链接（可选）</label>
          <input
            v-model="form.image"
            placeholder="粘贴一张图片网址，让这一刻更具体（选填）"
            class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] focus:outline-none focus:border-[#7c9cb8]"
          />
        </div>

        <div>
          <label class="block text-[14px] text-[#5a6b7c] mb-1.5">来源 / 出处（可选）</label>
          <input
            v-model="form.source"
            maxlength="200"
            placeholder="如：某本书 / 一位朋友 / 自己的日记（选填）"
            class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] focus:outline-none focus:border-[#7c9cb8]"
          />
        </div>

        <p v-if="error" class="text-[13px] text-[#e07a3f] m-0">{{ error }}</p>
        <p v-if="success" class="text-[13px] text-[#5a9e7a] m-0">✅ 已收到，等待审核通过后就会出现在社区里～</p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full py-3 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-xl text-[15px] font-semibold disabled:opacity-50 transition hover:opacity-90"
        >
          {{ submitting ? '提交中…' : '提交治愈瞬间' }}
        </button>
      </form>
    </section>

    <!-- 我的投稿 -->
    <section v-if="auth.isLoggedIn && myCards.length" class="bg-white rounded-2xl border border-[#eef2f7] p-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">我的投稿</h2>
      <ul class="space-y-2">
        <li
          v-for="c in myCards"
          :key="c.id"
          class="flex items-center gap-3 py-2.5 border-b border-[#f3f6f9] last:border-0"
        >
          <RouterLink :to="`/user-card/${c.id}`" class="flex-1 min-w-0 no-underline">
            <span class="block text-[14px] text-[#3a4a5c] truncate">{{ c.title }}</span>
            <span class="text-[12px] text-[#9aa6b2]">{{ fmt(c.created_at) }}</span>
          </RouterLink>
          <span class="text-[12px] px-2 py-0.5 rounded-full shrink-0" :class="statusClass(c.status)">
            {{ statusText(c.status) }}
          </span>
        </li>
      </ul>
    </section>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { userCardsApi } from '../api/userCards'

const auth = useAuthStore()
const categories = ['暖心', '成长', '小确幸', '树洞', '其他']

const form = reactive({ title: '', category: '暖心', content: '', image: '', source: '' })
const submitting = ref(false)
const error = ref('')
const success = ref(false)
const myCards = ref([])

function authorInfo() {
  const u = auth.currentUser
  return {
    author_id: u.id || u.username,
    author_name: u.name || u.username,
    author_type: u.type || (auth.isGuest ? 'guest' : 'github'),
  }
}

async function submit() {
  error.value = ''
  success.value = false
  if (!form.title.trim() || !form.content.trim()) {
    error.value = '标题和内容都不能为空'
    return
  }
  submitting.value = true
  try {
    await userCardsApi.submit({ ...authorInfo(), title: form.title.trim(), content: form.content.trim(), category: form.category, image: form.image.trim(), source: form.source.trim() })
    success.value = true
    form.title = ''
    form.content = ''
    form.image = ''
    form.source = ''
    form.category = '暖心'
    await loadMyCards()
  } catch (e) {
    error.value = e.message || '提交失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}

async function loadMyCards() {
  const u = auth.currentUser
  if (!u) return
  try {
    myCards.value = await userCardsApi.getMine(u.id || u.username)
  } catch {
    myCards.value = []
  }
}

function statusText(s) {
  return { pending: '审核中', approved: '已通过', rejected: '已拒绝' }[s] || s
}
function statusClass(s) {
  return {
    pending: 'bg-[#fef3c7] text-[#92400e]',
    approved: 'bg-[#dcfce7] text-[#166534]',
    rejected: 'bg-[#fee2e2] text-[#991b1b]',
  }[s] || 'bg-[#eef2f7] text-[#9aa6b2]'
}
function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  auth.restoreUser()
  if (auth.isLoggedIn) loadMyCards()
})
</script>
