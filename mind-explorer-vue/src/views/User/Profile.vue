<template>
  <main class="container" style="padding: 40px 20px; max-width: 800px; margin: 0 auto;">
    <div v-if="auth.isLoggedIn">
      <div class="profile-header">
        <img v-if="auth.user?.avatar" :src="auth.user.avatar" class="profile-avatar" />
        <div v-else class="profile-avatar guest-avatar">{{ auth.displayName.charAt(0) }}</div>
        <div>
          <h1>{{ auth.displayName }}</h1>
          <span v-if="auth.isGuest" class="guest-badge">游客</span>
          <span v-else class="github-badge">GitHub 用户</span>
        </div>
      </div>

      <div class="stats">
        <div class="stat-item"><strong>{{ userPosts.length }}</strong><span>发布帖子</span></div>
        <div class="stat-item"><strong>{{ userComments.length }}</strong><span>评论</span></div>
      </div>

      <h2 style="margin: 30px 0 16px;">我发布的帖子</h2>
      <div v-if="userPosts.length" class="post-list">
        <div v-for="post in userPosts" :key="post.id" class="post-item">
          <RouterLink :to="`/community/${post.id}`" class="post-title">{{ post.title }}</RouterLink>
          <small>{{ formatTime(post.created_at) }}</small>
        </div>
      </div>
      <p v-else class="empty-tip">还没有发布帖子，<RouterLink to="/community">去社区看看</RouterLink></p>

      <h2 style="margin: 30px 0 16px;">我的评论</h2>
      <div v-if="userComments.length" class="comment-list">
        <div v-for="comment in userComments" :key="comment.id" class="comment-item">
          <p>{{ comment.content }}</p>
          <small v-if="comment.post_id && postTitleMap[comment.post_id]">
            在帖子 <RouterLink :to="`/community/${comment.post_id}`" class="comment-post-link">{{ postTitleMap[comment.post_id] }}</RouterLink> 中评论 · {{ formatTime(comment.created_at) }}
          </small>
          <small v-else>评论于 {{ formatTime(comment.created_at) }}</small>
        </div>
      </div>
      <p v-else class="empty-tip">还没有评论</p>
    </div>

    <div v-else class="not-logged">
      <p>请先登录或成为游客</p>
      <el-button @click="auth.login()" type="primary">GitHub 登录</el-button>
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { communityApi } from '../../api/community'

const auth = useAuthStore()
const userPosts = ref([])
const userComments = ref([])
const postTitleMap = ref({})

onMounted(async () => {
  auth.restoreUser()
  if (auth.isLoggedIn) {
    await loadUserContent()
  }
})

async function loadUserContent() {
  try {
    const user = auth.currentUser
    const identifier = user.type === 'github' ? user.username : user.id

    // 获取全部帖子，用于匹配用户帖子和评论对应的标题
    const allPosts = await communityApi.getPosts()
    allPosts.forEach(p => { postTitleMap.value[p.id] = p.title })

    // 查询发布的帖子
    userPosts.value = allPosts.filter(p =>
      p.user_type === (user.type || 'guest') && p.username === user.name
    )

    // 查询评论（需要从 Supabase 直接查）
    const { data: comments } = await supabaseQuery(identifier)
    userComments.value = comments || []
  } catch (e) {
    console.log('加载用户内容失败', e)
  }
}

// 辅助函数：查询用户评论
async function supabaseQuery(identifier) {
  const { supabase } = await import('../../api/supabase')
  return await supabase
    .from('post_comments')
    .select('*')
    .eq('user_identifier', identifier)
    .order('created_at', { ascending: false })
}

function formatTime(time) {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.profile-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.profile-avatar { width: 64px; height: 64px; border-radius: 50%; }
.guest-avatar { background: #e0e0e0; color: #666; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; }
.guest-badge { background: #f0f0f0; color: #888; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; }
.github-badge { background: #e8f4fc; color: #0366d6; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; }
.stats { display: flex; gap: 24px; margin-bottom: 20px; }
.stat-item { text-align: center; }
.stat-item strong { display: block; font-size: 1.5rem; }
.stat-item span { color: #999; font-size: 0.85rem; }
.post-item { padding: 12px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 8px; }
.post-title { color: #333; text-decoration: none; font-weight: bold; }
.empty-tip { color: #999; }
.comment-item { padding: 12px; background: #f9f9f9; border-radius: 8px; margin-bottom: 8px; }
.comment-item small { color: #999; }
.comment-post-link { color: #0366d6; text-decoration: none; }
.comment-post-link:hover { text-decoration: underline; }
.not-logged { text-align: center; padding: 60px; }
</style>
