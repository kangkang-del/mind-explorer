<template>
  <main class="container" style="padding: 40px 20px; max-width: 800px; margin: 0 auto;">
    <RouterLink to="/community" class="back-link">← 返回社区</RouterLink>

    <div v-if="post.id">
      <h1 style="margin: 20px 0 8px;">{{ post.title }}</h1>
      <div class="post-meta" style="margin-bottom: 24px;">
        <span>{{ post.username }}</span>
        <span v-if="post.user_type === 'guest'" class="guest-badge">游客</span>
        <span v-else class="github-badge">GitHub</span>
        <small>{{ formatTime(post.created_at) }}</small>
      </div>
      <div class="post-content" style="line-height: 1.8; font-size: 1.05rem; white-space: pre-wrap;">{{ post.content }}</div>

      <!-- 认同 -->
      <div class="like-area" style="margin: 24px 0;">
        <button @click="toggleLike" class="like-btn" :class="{ liked: isLiked }" :disabled="!auth.isLoggedIn">
          👍 {{ likeCount }} <span v-if="!auth.isLoggedIn" class="like-hint">（登录后认同）</span>
        </button>
        <button
          @click="reportOpen = true"
          class="text-[13px] text-[#9aa6b2] hover:text-[#e07a3f] transition ml-4 align-middle"
        >
          ⚠️ 举报
        </button>
      </div>

      <!-- 评论 -->
      <div class="comments-section">
        <h3>评论 ({{ comments.length }})</h3>

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
          <button @click="auth.login()" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7c9cb8] text-white text-sm font-medium transition hover:bg-[#6b8aa6]">GitHub 登录</button>
          <span class="divider">或</span>
          <input v-model="guestName" placeholder="输入昵称" class="w-[150px] px-3 py-2 rounded-lg border border-[#e2e8f0] bg-white text-sm text-[#3a4a5c] outline-none transition focus:border-[#7c9cb8] focus:ring-2 focus:ring-[#7c9cb8]/20 placeholder:text-[#b8c2cc]" />
          <button @click="becomeGuest" class="px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white text-[#5a6b7c] text-sm transition hover:bg-[#f0f4f9]">游客评论</button>
        </div>

        <div v-if="comments.length" class="comment-list" style="margin-top: 20px;">
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
        <div v-else class="no-comments">暂无评论</div>
      </div>
    </div>

    <div v-else>
      <h2>帖子未找到</h2>
      <RouterLink to="/community">返回社区</RouterLink>
    </div>

    <ReportDialog
      :open="reportOpen"
      target-type="community_post"
      :target-id="post.id"
      @close="reportOpen = false"
      @submitted="onReported"
    />
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { communityApi } from '../../api/community'
import { reportsApi } from '../../api/reports'
import ReportDialog from '../../components/ReportDialog.vue'

const route = useRoute()
const auth = useAuthStore()
const post = ref({})
const comments = ref([])
const newComment = ref('')
const submitting = ref(false)
const guestName = ref('')
const likeCount = ref(0)
const isLiked = ref(false)
const liking = ref(false)
const reportOpen = ref(false)

function onReported() {
  reportOpen.value = false
  alert('已收到你的举报，我们会尽快核实，谢谢你的守护 💛')
}

onMounted(async () => {
  auth.restoreUser()
  const id = route.params.id
  await loadPost(id)
  await loadComments(id)
  await loadLikes(id)
})

async function loadPost(id) {
  try {
    post.value = await communityApi.getPost(id)
  } catch (e) {
    console.log('帖子加载失败', e)
    post.value = {}
  }
}

async function loadLikes(id) {
  try {
    const likes = await communityApi.getLikes(id)
    likeCount.value = likes.length
    if (auth.isLoggedIn) {
      const user = auth.currentUser
      const identifier = user.type === 'github' ? user.username : user.id
      isLiked.value = likes.some(l => l.user_identifier === identifier)
    }
  } catch (e) {
    console.log('认同加载失败', e)
  }
}

async function toggleLike() {
  if (!auth.isLoggedIn) { alert('请先登录或成为游客后再认同'); return }
  if (liking.value) return
  liking.value = true
  try {
    const user = auth.currentUser
    if (auth.user && !auth.user.type) auth.user.type = 'github'
    const result = await communityApi.toggleLike(route.params.id, user)
    isLiked.value = result.liked
    likeCount.value += result.liked ? 1 : -1
  } catch (e) {
    alert('操作失败：' + (e.message || '请稍后再试'))
  } finally {
    liking.value = false
  }
}

async function loadComments(id) {
  try {
    comments.value = await communityApi.getComments(id)
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
    await communityApi.addComment(route.params.id, newComment.value, auth.currentUser)
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
.post-meta { display: flex; align-items: center; gap: 8px; color: #999; font-size: 0.9rem; }
.guest-badge { background: #f0f0f0; color: #888; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; }
.github-badge { background: #e8f4fc; color: #0366d6; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; }
.like-area { margin: 24px 0; }
.like-btn { padding: 8px 20px; border: 2px solid #ddd; border-radius: 20px; background: #fff; font-size: 1rem; cursor: pointer; transition: all 0.2s; }
.like-btn:hover:not(:disabled) { border-color: #4CAF50; }
.like-btn.liked { background: #4CAF50; color: #fff; border-color: #4CAF50; }
.like-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.like-hint { font-size: 0.8rem; font-weight: normal; }
.current-user { margin-bottom: 8px; color: #666; font-size: 0.9rem; }
.user-avatar-sm { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; }
.login-options { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.divider { color: #999; }
.guest-avatar { background: #e0e0e0; color: #666; display: flex; align-items: center; justify-content: center; font-weight: bold; }
.comment-header { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.comment-header small { color: #aaa; margin-left: auto; }
</style>
