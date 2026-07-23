<template>
  <main class="max-w-3xl mx-auto px-4 py-6">
    <!-- 登录门 -->
    <section v-if="!authed" class="bg-white rounded-2xl border border-[#eef2f7] p-8 max-w-sm mx-auto text-center">
      <div class="text-[28px] mb-2">🔐</div>
      <h1 class="text-lg font-bold text-[#3a4a5c] m-0 mb-4">审核后台</h1>
      <input
        v-model="pwd"
        type="password"
        placeholder="管理员密码"
        @keyup.enter="checkPwd"
        class="w-full px-3 py-2.5 border border-[#e0e6ec] rounded-xl text-[14px] focus:outline-none focus:border-[#7c9cb8] mb-3"
      />
      <button
        @click="checkPwd"
        class="w-full py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-xl text-[14px] font-semibold hover:opacity-90 transition"
      >
        进入
      </button>
      <p v-if="pwdError" class="text-[13px] text-[#e07a3f] m-0 mt-3">{{ pwdError }}</p>
    </section>

    <!-- 后台主体 -->
    <section v-else>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-[#3a4a5c] m-0">🔐 审核后台</h1>
        <button @click="logout" class="text-[13px] text-[#9aa6b2] hover:text-[#e07a3f] transition">退出</button>
      </div>

      <div class="flex gap-2 mb-4">
        <button
          v-for="t in tabs"
          :key="t.key"
          @click="load(t.key)"
          class="px-4 py-2 rounded-xl text-[14px] border transition"
          :class="tab === t.key ? 'border-[#7c9cb8] bg-[#f0f4f9] text-[#3a4a5c] font-semibold' : 'border-[#eef2f7] text-[#9aa6b2] hover:border-[#c5d8ea]'"
        >
          {{ t.label }} ({{ counts[t.key] }})
        </button>
      </div>

      <p v-if="loading" class="text-center text-[#9aa6b2] py-10 m-0">加载中…</p>

      <!-- 举报列表 -->
      <div v-else-if="tab === 'reports'" class="space-y-3">
        <p v-if="!list.length" class="text-center text-[#9aa6b2] py-10 m-0">暂无待处理举报</p>
        <article
          v-for="r in list"
          :key="r.id"
          class="bg-white rounded-2xl border border-[#eef2f7] p-4"
        >
          <div class="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 class="text-[15px] font-semibold text-[#3a4a5c] m-0">{{ targetLabel(r.target_type) }} #{{ r.target_id }}</h3>
              <span class="inline-block mt-1 text-[12px] px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#991b1b]">{{ r.reason }}</span>
            </div>
            <span class="text-[12px] text-[#9aa6b2] shrink-0">{{ fmt(r.created_at) }}</span>
          </div>
          <p v-if="r.detail" class="text-[13px] text-[#5a6b7c] leading-7 whitespace-pre-wrap m-0 mb-2">{{ r.detail }}</p>
          <button @click="resolveReport(r.id)" class="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[#7c9cb8] hover:opacity-90 transition">标记已处理</button>
        </article>
      </div>

      <!-- 卡片列表 -->
      <div v-else class="space-y-3">
        <p v-if="!list.length" class="text-center text-[#9aa6b2] py-10 m-0">暂无{{ tabLabel }}内容</p>
        <article
          v-for="c in list"
          :key="c.id"
          class="bg-white rounded-2xl border border-[#eef2f7] p-4"
        >
          <div class="flex items-start justify-between gap-3 mb-2">
            <h3 class="text-[15px] font-semibold text-[#3a4a5c] m-0">{{ c.title }}</h3>
            <span class="text-[12px] px-2 py-0.5 rounded-full shrink-0" :class="statusClass(c.status)">{{ statusText(c.status) }}</span>
          </div>
          <p class="text-[12px] text-[#9aa6b2] m-0 mb-2">
            分类：{{ c.category || '未分类' }} · 作者：{{ c.author_name }} · {{ fmt(c.created_at) }}
            <span v-if="c.featured" class="ml-2 text-[#b4791f]">✨ 精选</span>
          </p>
          <p class="text-[14px] text-[#5a6b7c] leading-7 whitespace-pre-wrap m-0 mb-2">{{ c.content }}</p>
          <p v-if="c.source" class="text-[12px] text-[#9aa6b2] m-0 mb-2">来源：{{ c.source }}</p>
          <div v-if="c.status === 'approved'" class="flex gap-2 mt-1">
            <button
              @click="toggleFeature(c)"
              class="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white transition"
              :class="c.featured ? 'bg-[#e0a458] hover:opacity-90' : 'bg-[#7c9cb8] hover:opacity-90'"
            >
              {{ c.featured ? '⭐ 取消精选' : '✨ 设为精选' }}
            </button>
          </div>
          <div v-else-if="c.status === 'pending'" class="flex gap-2 mt-1">
            <button @click="act(c.id, 'approve')" class="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[#5a9e7a] hover:opacity-90 transition">✅ 通过</button>
            <button @click="act(c.id, 'reject')" class="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[#d98a8a] hover:opacity-90 transition">❌ 拒绝</button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { userCardsApi } from '../api/userCards'
import { reportsApi } from '../api/reports'

const pwd = ref('')
const pwdError = ref('')
const authed = ref(false)
const adminPwd = ref('')
const tab = ref('pending')
const loading = ref(false)
const list = ref([])
const counts = ref({ pending: 0, approved: 0, rejected: 0, reports: 0 })
const tabs = [
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '通过' },
  { key: 'rejected', label: '拒绝' },
  { key: 'reports', label: '举报' },
]
const tabLabel = { pending: '待审', approved: '已通过', rejected: '已拒绝' }

function checkPwd() {
  if (!pwd.value.trim()) {
    pwdError.value = '请输入密码'
    return
  }
  adminPwd.value = pwd.value.trim()
  authed.value = true
  pwdError.value = ''
  sessionStorage.setItem('admin_auth_pwd', adminPwd.value)
  loadAll()
}
function logout() {
  authed.value = false
  adminPwd.value = ''
  sessionStorage.removeItem('admin_auth_pwd')
}

async function loadAll() {
  const [pending, approved, rejected, reports] = await Promise.all([
    safeGet(() => userCardsApi.getPending(adminPwd.value)),
    safeGet(() => userCardsApi.getApproved(200)),
    safeGet(() => userCardsApi.getRejected(adminPwd.value)),
    safeGet(() => reportsApi.list(adminPwd.value)),
  ])
  counts.value = {
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    reports: reports.length,
  }
  list.value = { pending, approved, rejected, reports }[tab.value]
}
async function safeGet(fn) {
  try { return await fn() } catch { return [] }
}

async function load(t) {
  tab.value = t
  loading.value = true
  try {
    if (t === 'pending') list.value = await userCardsApi.getPending(adminPwd.value)
    else if (t === 'approved') list.value = await userCardsApi.getApproved(200)
    else if (t === 'reports') list.value = await reportsApi.list(adminPwd.value)
    else list.value = await userCardsApi.getRejected(adminPwd.value)
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

// 策展：设为/取消精选
async function toggleFeature(c) {
  try {
    await userCardsApi.setFeatured(c.id, !c.featured, adminPwd.value)
    c.featured = !c.featured
  } catch (e) {
    alert(e.message || '操作失败')
  }
}

// 举报：标记已处理
async function resolveReport(id) {
  try {
    await reportsApi.resolve(id, adminPwd.value)
    await loadAll()
    if (tab.value === 'reports') await load('reports')
  } catch (e) {
    alert(e.message || '操作失败')
  }
}

function targetLabel(type) {
  return { user_card: '治愈瞬间', community_post: '社区帖' }[type] || type
}

async function act(id, type) {
  try {
    if (type === 'approve') await userCardsApi.approve(id, adminPwd.value)
    else await userCardsApi.reject(id, adminPwd.value)
    await loadAll()
    await load(tab.value)
  } catch (e) {
    alert(e.message || '操作失败')
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
  const saved = sessionStorage.getItem('admin_auth_pwd')
  if (saved) {
    adminPwd.value = saved
    authed.value = true
    loadAll()
  }
})
</script>
