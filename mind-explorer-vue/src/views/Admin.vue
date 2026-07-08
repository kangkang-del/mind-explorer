<template>
  <main class="container" style="padding: 40px 20px; max-width: 900px; margin: 0 auto;">
    <!-- 登录守卫 -->
    <div v-if="!authed" class="login-box">
      <h1>🔐 审核后台</h1>
      <p class="tip">请输入管理员密码进入</p>
      <input v-model="pwd" type="password" placeholder="管理员密码" class="pwd-input" @keyup.enter="checkPwd" />
      <button @click="checkPwd" class="login-btn">进入</button>
      <p v-if="pwdError" class="error">{{ pwdError }}</p>
    </div>

    <!-- 审核界面 -->
    <div v-else>
      <div class="header">
        <h1>🔐 审核后台</h1>
        <button @click="authed = false" class="logout-btn">退出</button>
      </div>

      <div class="tabs">
        <button :class="{active: tab==='pending'}" @click="switchTab('pending')">待审核 ({{ pending.length }})</button>
        <button :class="{active: tab==='approved'}" @click="switchTab('approved')">已通过 ({{ approved.length }})</button>
        <button :class="{active: tab==='rejected'}" @click="switchTab('rejected')">已拒绝 ({{ rejected.length }})</button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="!currentList.length" class="empty">暂无{{ tabText }}卡片</div>

      <div v-else class="review-list">
        <div v-for="card in currentList" :key="card.id" class="review-item">
          <div class="review-head">
            <strong>{{ card.title }}</strong>
            <span class="badge" :class="card.status">{{ statusText(card.status) }}</span>
          </div>
          <div class="review-meta">
            分类: {{ card.category || '未分类' }} · 作者: {{ card.author_name }} · {{ formatTime(card.created_at) }}
          </div>
          <p class="review-content">{{ card.content }}</p>
          <div v-if="card.source" class="review-source">来源: {{ card.source }}</div>

          <div v-if="card.status === 'pending'" class="actions">
            <button @click="doApprove(card.id)" class="approve-btn">✅ 通过</button>
            <button @click="doReject(card.id)" class="reject-btn">❌ 拒绝</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { userCardsApi } from '../api/userCards'

const ADMIN_PWD = 'mind2024'  // 管理员密码（生产应改为环境变量/后端校验）

const pwd = ref('')
const pwdError = ref('')
const authed = ref(false)
const tab = ref('pending')
const loading = ref(false)
const pending = ref([])
const approved = ref([])
const rejected = ref([])

const currentList = computed(() => {
  return { pending: pending.value, approved: approved.value, rejected: rejected.value }[tab.value]
})
const tabText = computed(() => ({ pending: '待审核', approved: '已通过', rejected: '已拒绝' }[tab.value]))

function checkPwd() {
  if (pwd.value === ADMIN_PWD) {
    authed.value = true
    pwdError.value = ''
    loadAll()
  } else {
    pwdError.value = '密码错误'
  }
}

async function loadAll() {
  loading.value = true
  try {
    const all = await userCardsApi.getPending()  // 先取 pending
    pending.value = all
    // 已审核的通过过滤获取
    approved.value = await userCardsApi.getByStatus('approved')
    rejected.value = await userCardsApi.getByStatus('rejected')
  } catch (e) {
    console.log('加载失败', e)
  } finally {
    loading.value = false
  }
}

async function switchTab(t) {
  tab.value = t
}

async function doApprove(id) {
  try {
    await userCardsApi.approve(id, 'admin')
    await loadAll()
  } catch (e) {
    alert(e.message)
  }
}

async function doReject(id) {
  try {
    await userCardsApi.reject(id, 'admin')
    await loadAll()
  } catch (e) {
    alert(e.message)
  }
}

function statusText(s) {
  return { pending: '审核中', approved: '已通过', rejected: '已拒绝' }[s] || s
}

function formatTime(time) {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  // 恢复会话（sessionStorage）
  if (sessionStorage.getItem('admin_auth') === '1') {
    authed.value = true
    loadAll()
  }
})

// 进入时记录会话
import { watch } from 'vue'
watch(authed, (v) => {
  if (v) sessionStorage.setItem('admin_auth', '1')
  else sessionStorage.removeItem('admin_auth')
})
</script>

<style scoped>
.login-box { text-align: center; padding: 60px 20px; }
.tip { color: var(--text-light); margin: 12px 0; }
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
