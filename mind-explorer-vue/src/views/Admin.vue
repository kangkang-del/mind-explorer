<template>
  <main class="container" style="padding: 40px 20px; max-width: 900px; margin: 0 auto;">
    <div v-if="!authed" class="login-box">
      <h1>🔐 审核后台</h1>
      <input v-model="pwd" type="password" placeholder="管理员密码" class="pwd-input" @keyup.enter="checkPwd" />
      <button @click="checkPwd" class="login-btn">进入</button>
      <p v-if="pwdError" class="error">{{ pwdError }}</p>
    </div>

    <div v-else>
      <div class="header">
        <h1>🔐 审核后台</h1>
        <button @click="logout" class="logout-btn">退出</button>
      </div>

      <div class="tabs">
        <button :class="{active: tab==='pending'}" @click="load('pending')">待审 ({{ counts.pending }})</button>
        <button :class="{active: tab==='approved'}" @click="load('approved')">通过 ({{ counts.approved }})</button>
        <button :class="{active: tab==='rejected'}" @click="load('rejected')">拒绝 ({{ counts.rejected }})</button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="!list.length" class="empty">暂无{{ tabText }}卡片</div>

      <div v-else class="review-list">
        <div v-for="c in list" :key="c.id" class="review-item">
          <div class="review-head">
            <strong>{{ c.title }}</strong>
            <span class="badge" :class="c.status">{{ statusText(c.status) }}</span>
          </div>
          <div class="review-meta">分类: {{ c.category || '未分类' }} · 作者: {{ c.author_name }} · {{ formatTime(c.created_at) }}</div>
          <p class="review-content">{{ c.content }}</p>
          <div v-if="c.source" class="review-source">来源: {{ c.source }}</div>
          <div v-if="c.status==='pending'" class="actions">
            <button @click="act(c.id,'approve')" class="approve-btn">✅ 通过</button>
            <button @click="act(c.id,'reject')" class="reject-btn">❌ 拒绝</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { userCardsApi } from '../api/userCards'

const ADMIN_PWD = 'mind2024'
const pwd = ref('')
const pwdError = ref('')
const authed = ref(false)
const tab = ref('pending')
const loading = ref(false)
const list = ref([])
const counts = ref({ pending: 0, approved: 0, rejected: 0 })
const tabText = { pending: '待审', approved: '已通过', rejected: '已拒绝' }

function checkPwd() {
  if (pwd.value === ADMIN_PWD) { authed.value = true; pwdError.value=''; loadAll() }
  else pwdError.value = '密码错误'
}
function logout() { authed.value=false; sessionStorage.removeItem('admin_auth') }

async function loadAll() {
  const [p, a, r] = await Promise.all([
    userCardsApi.getByStatus('pending'),
    userCardsApi.getByStatus('approved'),
    userCardsApi.getByStatus('rejected')
  ])
  counts.value = { pending: p.length, approved: a.length, rejected: r.length }
  list.value = { pending: p, approved: a, rejected: r }[tab.value]
}

async function load(t) {
  tab.value = t
  loading.value = true
  list.value = await userCardsApi.getByStatus(t)
  loading.value = false
}

async function act(id, type) {
  if (type === 'approve') await userCardsApi.approve(id, 'admin')
  else await userCardsApi.reject(id, 'admin')
  loadAll()
}

function statusText(s) { return tabText[s] || s }
function formatTime(t) { return t ? new Date(t).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '' }

onMounted(() => {
  if (sessionStorage.getItem('admin_auth') === '1') { authed.value = true; loadAll() }
})
</script>

<style scoped>
.login-box { text-align: center; padding: 60px 20px; }
.pwd-input { padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 15px; width: 240px; }
.login-btn { margin-left: 8px; padding: 12px 20px; border: none; border-radius: 8px; background: var(--primary); color: #fff; cursor: pointer; }
.error { color: var(--danger); margin-top: 12px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.logout-btn { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; }
.tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.tabs button { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; }
.tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.loading, .empty { text-align: center; padding: 40px; color: var(--text-light); }
.review-list { display: flex; flex-direction: column; gap: 16px; }
.review-item { padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); box-shadow: var(--shadow); }
.review-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.review-meta { font-size: 0.85rem; color: var(--text-light); margin-bottom: 12px; }
.review-content { line-height: 1.8; margin-bottom: 8px; white-space: pre-wrap; }
.review-source { font-size: 0.85rem; color: var(--text-light); margin-bottom: 12px; }
.badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; }
.badge.pending { background: #fef3c7; color: #92400e; }
.badge.approved { background: #dcfce7; color: #166534; }
.badge.rejected { background: #fee2e2; color: #991b1b; }
.actions { display: flex; gap: 12px; margin-top: 12px; }
.approve-btn { padding: 8px 20px; border: none; border-radius: 8px; background: var(--success); color: #fff; cursor: pointer; }
.reject-btn { padding: 8px 20px; border: none; border-radius: 8px; background: var(--danger); color: #fff; cursor: pointer; }
</style>
