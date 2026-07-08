<template>
  <main class="container" style="padding: 40px 20px; max-width: 800px; margin: 0 auto;">
    <h1>💬 社区交流</h1>
    <p>在这里分享你的想法和经验</p>

    <!-- 发帖区 -->
    <div v-if="auth.isLoggedIn" class="post-form">
      <div class="current-user">
        <span v-if="auth.user"><img :src="auth.user.avatar" class="user-avatar-sm" /> {{ auth.user.name }}</span>
        <span v-else>👤 游客：{{ auth.guest.name }}</span>
      </div>
      <el-input v-model="newTitle" placeholder="标题" style="margin-bottom: 8px;" />
      <el-input v-model="newContent" type="textarea" :rows="3" placeholder="分享你的想法..." />
      <el-button type="primary" @click="submitPost" :loading="posting" style="margin-top: 8px">发布帖子</el-button>
    </div>

    <div v-else class="login-options">
      <p>参与社区：</p>
      <el-button @click="auth.login()" type="primary">GitHub 登录</el-button>
      <span class="divider">或</span>
      <el-input v-model="guestName" placeholder="输入昵称" style="width: 150px" />
      <el-button @click="becomeGuest">游客模式</el-button>
    </div>

    <!-- 帖子列表 -->
    <div v-if="posts.length" class="post-list" style="margin-top: 30px;">
      <div v-for="post in posts" :key="post.id" class="post-item">
        <RouterLink :to="`/community/${post.id}`" class="post-title">{{ post.title }}</RouterLink>
        <p class="post-preview">{{ post.content.slice(0, 100) }}{{ post.content.length > 100 ? '...' : '' }}</p>
        <div class="post-meta">
          <span>{{ post.username }}</span>
          <span v-if="post.user_type === 'guest'" class="guest-badge">游客</span>
          <span v-else class="github-badge">GitHub</span>
          <small>{{ formatTime(post.created_at) }}</small>
        </div>
      </div>
    </div>
    <div v-else class="no-posts">还没有帖子，快来发第一条吧！</div>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { communityApi } from '../../api/community'

const auth = useAuthStore()
const posts = ref([])
const newTitle = ref('')
const newContent = ref('')
const posting = ref(false)
const guestName = ref('')

onMounted(async () => {
  auth.restoreUser()
  await loadPosts()
})

async function loadPosts() {
  try {
    posts.value = await communityApi.getPosts()
  } catch (e) {
    console.log('帖子加载失败', e)
    posts.value = []
  }
}

async function becomeGuest() {
  if (!guestName.value.trim()) { alert('请输入昵称'); return }
  auth.createGuest(guestName.value)
}

async function submitPost() {
  if (!newTitle.value.trim() || !newContent.value.trim()) { alert('请填写标题和内容'); return }
  posting.value = true
  try {
    if (auth.user && !auth.user.type) auth.user.type = 'github'
    await communityApi.addPost(newTitle.value, newContent.value, auth.currentUser)
    newTitle.value = ''
    newContent.value = ''
    await loadPosts()
  } catch (e) {
    alert('发布失败：' + (e.message || '请稍后再试'))
  } finally {
    posting.value = false
  }
}

function formatTime(time) {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.post-form { background: #f9f9f9; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
.current-user { margin-bottom: 8px; color: #666; font-size: 0.9rem; }
.user-avatar-sm { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; }
.login-options { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
.divider { color: #999; }
.post-item { padding: 16px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 12px; }
.post-title { font-size: 1.1rem; font-weight: bold; color: #333; text-decoration: none; }
.post-preview { color: #666; margin: 8px 0; }
.post-meta { display: flex; align-items: center; gap: 8px; color: #999; font-size: 0.85rem; }
.guest-badge { background: #f0f0f0; color: #888; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; }
.github-badge { background: #e8f4fc; color: #0366d6; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; }
.no-posts { text-align: center; color: #999; padding: 40px; }
</style>
