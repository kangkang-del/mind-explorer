<template>
  <main class="container" style="padding: 40px 20px; max-width: 800px; margin: 0 auto;">
    <div v-if="!auth.isLoggedIn" class="not-logged">
      <p>请先登录或注册游客账号后再上传内容</p>
      <el-button @click="showLogin" type="primary">登录 / 注册</el-button>
    </div>

    <div v-else>
      <h1 style="margin-bottom: 8px;">上传知识卡片</h1>
      <p style="color: var(--text-light); margin-bottom: 24px;">
        提交的知识卡片会经过审核，通过后展示在学习页「用户贡献」区
      </p>

      <form @submit.prevent="submit" class="upload-form">
        <div class="form-group">
          <label>标题 *</label>
          <input v-model="form.title" required placeholder="如：确认偏误的三种表现" maxlength="60" />
        </div>

        <div class="form-group">
          <label>分类</label>
          <select v-model="form.category">
            <option value="">不分类</option>
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>摘要</label>
          <input v-model="form.summary" placeholder="一句话概括（可选）" maxlength="120" />
        </div>

        <div class="form-group">
          <label>内容 *</label>
          <textarea v-model="form.content" required rows="8" placeholder="详细描述这个知识点..."></textarea>
        </div>

        <div class="form-group">
          <label>来源/出处</label>
          <input v-model="form.source" placeholder="如：某书籍/论文/网站（可选）" maxlength="200" />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="success" class="success-msg">✅ 提交成功！等待审核通过后展示</div>

        <button type="submit" :disabled="submitting" class="submit-btn">
          {{ submitting ? '提交中...' : '提交审核' }}
        </button>
      </form>

      <!-- 我的投稿 -->
      <div v-if="myCards.length" class="my-cards">
        <h2 style="margin: 30px 0 16px;">我的投稿</h2>
        <div v-for="card in myCards" :key="card.id" class="my-card">
          <div class="my-card-title">{{ card.title }}</div>
          <span class="status-badge" :class="card.status">{{ statusText(card.status) }}</span>
          <small>{{ formatTime(card.created_at) }}</small>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { userCardsApi } from '../api/userCards'
import cards from '../data/cards.json'

const auth = useAuthStore()
const categories = [...new Set(cards.map(c => c.category).filter(Boolean))]

const form = ref({ title: '', category: '', summary: '', content: '', source: '' })
const submitting = ref(false)
const error = ref('')
const success = ref(false)
const myCards = ref([])

function showLogin() {
  // 触发 Navbar 的登录弹窗（通过自定义事件或直接调用）
  window.dispatchEvent(new CustomEvent('open-login'))
}

async function submit() {
  error.value = ''
  success.value = false
  if (!form.value.title.trim() || !form.value.content.trim()) {
    error.value = '标题和内容不能为空'
    return
  }
  const user = auth.currentUser
  submitting.value = true
  try {
    await userCardsApi.submit({
      title: form.value.title.trim(),
      content: form.value.content.trim(),
      category: form.value.category || null,
      summary: form.value.summary.trim() || null,
      source: form.value.source.trim() || null,
      author_id: user.id,
      author_name: user.name,
      author_type: user.type || 'guest'
    })
    success.value = true
    form.value = { title: '', category: '', summary: '', content: '', source: '' }
    await loadMyCards()
  } catch (e) {
    error.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

async function loadMyCards() {
  const user = auth.currentUser
  if (!user) return
  try {
    myCards.value = await userCardsApi.getByAuthor(user.id)
  } catch (e) {
    myCards.value = []
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
  auth.restoreUser()
  if (auth.isLoggedIn) loadMyCards()
})
</script>

<style scoped>
.upload-form { background: var(--card-bg); padding: 24px; border-radius: var(--radius); box-shadow: var(--shadow); }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-weight: 600; color: var(--text); }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 8px; font-size: 14px; box-sizing: border-box; font-family: inherit;
}
.form-group textarea { resize: vertical; }
.error-msg { color: var(--danger); margin-bottom: 12px; }
.success-msg { color: var(--success); margin-bottom: 12px; }
.submit-btn {
  width: 100%; padding: 12px; border: none; border-radius: 8px;
  background: var(--primary); color: #fff; font-size: 15px; cursor: pointer; font-weight: 600;
}
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.my-cards { margin-top: 30px; }
.my-card { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
.my-card-title { flex: 1; font-weight: 600; }
.status-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; }
.status-badge.pending { background: #fef3c7; color: #92400e; }
.status-badge.approved { background: #dcfce7; color: #166534; }
.status-badge.rejected { background: #fee2e2; color: #991b1b; }
.my-card small { color: var(--text-light); }

.not-logged { text-align: center; padding: 60px; }
</style>
