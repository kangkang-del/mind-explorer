<template>
  <main class="container">
    <RouterLink to="/study" class="back-link">← 返回知识列表</RouterLink>

    <div class="card-detail-page" v-if="card.id">
        <div class="card-detail-header">
        <span class="card-category">{{ card.category }}</span>
        <h1>{{ card.title }}</h1>
        <div class="flex items-center justify-between">
          <div class="proponent-badge"><span>👤 提出者：{{ card.proponent }}</span></div>
          <FavoriteButton type="card" :id="card.id" :title="card.title" :summary="card.summary" :link="`/card/${card.id}`" variant="full" />
        </div>
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

      <div class="study-links-box">
        <h3>🔎 延伸学习</h3>
        <p class="study-links-tip">去视频与百科平台，看别人怎么讲「{{ searchKeyword }}」：</p>
        <div class="study-links">
          <a v-for="l in studyLinks" :key="l.name" :href="l.url" target="_blank" rel="noopener" class="study-link">
            <span>{{ l.icon }}</span> {{ l.name }}
          </a>
        </div>
      </div>

      <div class="card-interact-section">
        <h3>💬 互动</h3>

        <!-- 同感按钮 -->
        <div class="like-area">
          <button @click="toggleLike" class="like-btn" :class="{ liked: isLiked }" :disabled="liking">
            🤝 同感 {{ likeCount }} <span v-if="!auth.isLoggedIn" class="like-hint">（点一下，登录后同感）</span>
          </button>
        </div>

        <div class="comments-section">
          <h4>评论 ({{ comments.length }})</h4>

          <div v-if="auth.isLoggedIn" class="comment-form">
            <div class="current-user">
              <span v-if="auth.user"><img :src="auth.user.avatar" class="user-avatar-sm" /> {{ auth.user.name }}</span>
              <span v-else>👤 游客：{{ auth.guest.name }}</span>
            </div>
            <textarea v-model="newComment" rows="3" placeholder="写下你的想法..." class="w-full px-3 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#3a4a5c] outline-none transition focus:border-[#7c9cb8] focus:ring-2 focus:ring-[#7c9cb8]/20 placeholder:text-[#b8c2cc] resize-y min-h-[72px]"></textarea>
            <button @click="submitComment" :disabled="submitting" class="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7c9cb8] text-white text-sm font-medium transition hover:bg-[#6b8aa6] disabled:opacity-60 disabled:cursor-not-allowed">{{ submitting ? '发表中…' : '发表评论' }}</button>
          </div>

          <div v-else class="login-options">
            <p>参与评论：</p>
            <button @click="auth.openLogin('register')" class="px-4 py-2 rounded-lg bg-[#7c9cb8] text-white text-sm font-medium transition hover:bg-[#6b8aa6]">游客注册 / 登录</button>
            <span class="divider">或</span>
            <button @click="auth.login()" class="px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-[#5a6b7c] text-sm transition hover:bg-[#f0f4f9]">GitHub 登录</button>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { cardApi } from '../../api/card'
import cards from '../../data/cards.json'
import FavoriteButton from '../../components/FavoriteButton.vue'

const route = useRoute()
const auth = useAuthStore()
const card = ref({})
const comments = ref([])
const newComment = ref('')
const submitting = ref(false)
const likeCount = ref(0)
const isLiked = ref(false)
const liking = ref(false)

// 延伸学习：从卡片标题提取中文主词（去掉英文括号注释），生成平台搜索链接
const searchKeyword = computed(() => {
  const raw = card.value.title || card.value.summary || '心理学'
  return raw.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || raw.trim()
})
const studyLinks = computed(() => {
  const kw = encodeURIComponent(searchKeyword.value)
  const kwPsy = encodeURIComponent(searchKeyword.value + ' 心理学')
  return [
    { icon: '📺', name: 'B站 · 讲解视频', url: `https://search.bilibili.com/all?keyword=${kwPsy}` },
    { icon: '💬', name: '知乎 · 相关文章', url: `https://www.zhihu.com/search?type=content&q=${kwPsy}` },
    { icon: '📖', name: '维基百科 · 词条', url: `https://zh.wikipedia.org/wiki/Special:Search?search=${kw}` },
  ]
})

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
    // 未登录：唤起全局登录/注册弹窗（默认注册模式），不再强制跳 GitHub
    auth.openLogin('register')
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
    alert('同感失败：' + (e.message || '请稍后再试'))
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
.like-btn:hover:not(:disabled) { border-color: #7c9cb8; color: #4a6a8a; }
.like-btn.liked { background: #7c9cb8; color: #fff; border-color: #7c9cb8; }
.like-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.like-hint { font-size: 0.8rem; font-weight: normal; }
.divider { color: #999; margin: 0 4px; }
.study-links-box { margin: 28px 0; padding: 20px 22px; background: #f6f9fc; border: 1px solid #eef2f7; border-radius: 14px; }
.study-links-box h3 { margin: 0 0 6px; color: #3a4a5c; font-size: 1.05rem; }
.study-links-tip { margin: 0 0 14px; color: #9aa6b2; font-size: 0.88rem; }
.study-links { display: flex; gap: 10px; flex-wrap: wrap; }
.study-link {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; border-radius: 20px; background: #fff;
  border: 1.5px solid #e2e8f0; color: #4a6a8a; font-size: 0.92rem;
  text-decoration: none; transition: all 0.2s;
}
.study-link:hover { border-color: #7c9cb8; background: #eef4fa; transform: translateY(-1px); }
.current-user { margin-bottom: 8px; color: #666; font-size: 0.9rem; }
.user-avatar-sm { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; }
.guest-avatar { background: #e0e0e0; color: #666; display: flex; align-items: center; justify-content: center; font-weight: bold; }
.guest-badge { background: #f0f0f0; color: #888; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.github-badge { background: #e8f4fc; color: #0366d6; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.comment-header { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.comment-header small { color: #aaa; margin-left: auto; }
</style>
