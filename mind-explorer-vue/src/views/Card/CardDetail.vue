<template>
  <main class="container">
    <RouterLink to="/study" class="back-link">← 返回知识列表</RouterLink>

    <div class="card-detail-page" v-if="card.id">
      <div class="card-detail-header">
        <span class="card-category">{{ card.category }}</span>
        <h1>{{ card.title }}</h1>
        <div class="proponent-badge"><span>👤 提出者：{{ card.proponent }}</span></div>
        <p class="card-summary-large">{{ card.summary }}</p>
      </div>

      <div class="card-detail-content" v-html="card.content"></div>

      <div class="key-points-box" v-if="card.keyPoints && card.keyPoints.length">
        <h3>🔑 核心要点</h3>
        <ul class="key-points-list">
          <li v-for="(point, i) in card.keyPoints" :key="i">{{ point }}</li>
        </ul>
      </div>

      <div class="examples-box" v-if="card.examples && card.examples.length">
        <h3>💡 生活实例</h3>
        <ul class="examples-list">
          <li v-for="(ex, i) in card.examples" :key="i">{{ ex }}</li>
        </ul>
      </div>

      <div class="card-interact-section">
        <h3>💬 互动</h3>

        <!-- 点赞按钮 -->
        <div class="like-area">
          <button @click="toggleLike" class="like-btn" :class="{ liked: isLiked }" :disabled="!auth.isLoggedIn">
            👍 {{ likeCount }} <span v-if="!auth.isLoggedIn" class="like-hint">（登录后点赞）</span>
          </button>
        </div>

        <div class="comments-section">
          <h4>评论 ({{ comments.length }})</h4>

          <div v-if="auth.isLoggedIn" class="comment-form">
            <div class="current-user">
              <span v-if="auth.user"><img :src="auth.user.avatar" class="user-avatar-sm" /> {{ auth.user.name }}</span>
              <span v-else>👤 游客：{{ auth.guest.name }}</span>
            </div>
            <el-input v-model="newComment" type="textarea" :rows="3" placeholder="写下你的想法..." />
            <el-button type="primary" @click="submitComment" :loading="submitting" style="margin-top: 8px">发表评论</el-button>
          </div>

          <div v-else class="login-options">
            <p>参与评论：</p>
            <el-button @click="auth.login()" type="primary">GitHub 登录</el-button>
            <span class="divider">或</span>
            <el-input v-model="guestName" placeholder="输入昵称" style="width: 150px" />
            <el-button @click="becomeGuest">游客评论</el-button>
          </div>

          <div v-if="comments.length" class="comment-list" style="margin-top: 20px">
            <div v-for="comment in comments" :key="comment.id" class="comment-item">
              <img v-if="comment.avatar" :src="comment.avatar" class="comment-avatar" />
              <div v-else class="comment-avatar guest-avatar">{{ comment.username.charAt(0) }}</div>
              <div class="comment-body">
                <div class="comment-header">
                  <strong>{{ comment.username }}</strong>
                  <span v-if="comment.user_type === 'guest'" class="guest-badge">游客</span>
                  <span v-else class="github-badge">GitHub</span>
                  <small>{{ formatTime(comment.created_at) }}</small>
                </div>
                <p>{{ comment.content }}</p>
              </div>
            </div>
          </div>
          <div v-else class="no-comments">暂无评论，快来发表第一条吧！</div>
        </div>
      </div>
    </div>

    <div v-else class="not-found">
      <h2>卡片未找到</h2>
      <RouterLink to="/study">返回知识列表</RouterLink>
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { cardApi } from '../../api/card'
import cards from '../../data/cards.json'

const route = useRoute()
const auth = useAuthStore()
const card = ref({})
const comments = ref([])
const newComment = ref('')
const submitting = ref(false)
const guestName = ref('')
const likeCount = ref(0)
const isLiked = ref(false)
const liking = ref(false)

onMounted(async () => {
  auth.restoreUser()
  const id = route.params.id
  const found = cards.find(c => c.id == id)
  if (found) card.value = found
  await loadComments(id)
  await loadLikes(id)
})

async function loadLikes(id) {
  try {
    const likes = await cardApi.getLikes(id)
    likeCount.value = likes.length
    // 检查当前用户是否点赞
    if (auth.isLoggedIn) {
      const user = auth.currentUser
      const identifier = user.type === 'github' ? user.username : user.id
      isLiked.value = likes.some(l => l.user_identifier === identifier)
    }
  } catch (e) {
    console.log('点赞加载失败', e)
    likeCount.value = 0
  }
}

async function toggleLike() {
  if (!auth.isLoggedIn) {
    alert('请先登录或成为游客后再点赞')
    return
  }
  if (liking.value) return
  liking.value = true
  try {
    const user = auth.currentUser
    if (auth.user && !auth.user.type) auth.user.type = 'github'
    const result = await cardApi.toggleLike(route.params.id, user)
    isLiked.value = result.liked
    likeCount.value += result.liked ? 1 : -1
  } catch (e) {
    alert('点赞失败：' + (e.message || '请稍后再试'))
  } finally {
    liking.value = false
  }
}

async function loadComments(id) {
  try {
    comments.value = await cardApi.getComments(id)
  } catch (e) {
    console.log('评论加载失败', e)
    comments.value = []
  }
}

async function becomeGuest() {
  if (!guestName.value.trim()) { alert('请输入昵称'); return }
  auth.createGuest(guestName.value)
}

async function submitComment() {
  if (!newComment.value.trim()) return
  submitting.value = true
  try {
    if (auth.user && !auth.user.type) auth.user.type = 'github'
    await cardApi.addComment(route.params.id, newComment.value, auth.currentUser)
    await loadComments(route.params.id)
    newComment.value = ''
  } catch (e) {
    alert('评论失败：' + (e.message || '请稍后再试'))
  } finally {
    submitting.value = false
  }
}

function formatTime(time) {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.login-options { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.like-area { margin-bottom: 20px; }
.like-btn {
  padding: 8px 20px; border: 2px solid #ddd; border-radius: 20px;
  background: #fff; font-size: 1rem; cursor: pointer; transition: all 0.2s;
}
.like-btn:hover:not(:disabled) { border-color: #4CAF50; }
.like-btn.liked { background: #4CAF50; color: #fff; border-color: #4CAF50; }
.like-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.like-hint { font-size: 0.8rem; font-weight: normal; }
.divider { color: #999; margin: 0 4px; }
.current-user { margin-bottom: 8px; color: #666; font-size: 0.9rem; }
.user-avatar-sm { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; }
.guest-avatar { background: #e0e0e0; color: #666; display: flex; align-items: center; justify-content: center; font-weight: bold; }
.guest-badge { background: #f0f0f0; color: #888; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.github-badge { background: #e8f4fc; color: #0366d6; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.comment-header { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.comment-header small { color: #aaa; margin-left: auto; }
</style>
