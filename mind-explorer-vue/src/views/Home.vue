<template>
  <main class="main-content">
    <!-- Hero 区 -->
    <section class="hero">
      <div class="hero-inner">
        <h1 class="hero-title">用科学理解心灵，以知识温暖生活</h1>
        <p class="hero-subtitle">96 张知识卡片 · 20 种心理疾病科普 · 16 位心理学家 · 18 个经典实验</p>

        <!-- 搜索框 -->
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索知识卡片、心理疾病、心理学家..."
            class="search-input"
            @keyup.enter="goToSearch"
          />
          <button class="search-btn" @click="goToSearch">🔍</button>
        </div>

        <!-- 统计数字 -->
        <div class="stats-row">
          <div class="stat"><strong>{{ cards.length }}</strong><span>知识卡片</span></div>
          <div class="stat"><strong>{{ health.length }}</strong><span>健康主题</span></div>
          <div class="stat"><strong>{{ postCount }}</strong><span>社区帖子</span></div>
        </div>
      </div>
    </section>

    <!-- 分类快捷入口 -->
    <section class="quick-nav">
      <RouterLink to="/study" class="quick-card study">
        <span class="quick-icon">📚</span>
        <span class="quick-text">开始学习</span>
      </RouterLink>
      <RouterLink to="/health" class="quick-card health">
        <span class="quick-icon">🧠</span>
        <span class="quick-text">了解心理</span>
      </RouterLink>
      <RouterLink to="/community" class="quick-card community">
        <span class="quick-icon">💬</span>
        <span class="quick-text">社区交流</span>
      </RouterLink>
      <RouterLink to="/user/profile" class="quick-card profile" v-if="auth.isLoggedIn">
        <span class="quick-icon">👤</span>
        <span class="quick-text">我的主页</span>
      </RouterLink>
    </section>

    <!-- 搜索结果 或 热门卡片 -->
    <section class="card-grid-section" v-if="!searchQuery.trim()">
      <h2 class="section-title">🔥 热门知识卡片</h2>
      <div class="card-grid">
        <CardItem v-for="card in cards.slice(0, 12)" :key="card.id" :card="card" />
      </div>
    </section>

    <section class="card-grid-section" v-else>
      <h2 class="section-title">搜索结果 ({{ filteredCards.length }})</h2>
      <div v-if="filteredCards.length" class="card-grid">
        <CardItem v-for="card in filteredCards.slice(0, 24)" :key="card.id" :card="card" />
      </div>
      <p v-else class="empty-tip">未找到相关内容，换个关键词试试</p>
    </section>

    <!-- 最新社区动态 -->
    <section class="community-preview" v-if="latestPosts.length">
      <h2 class="section-title">💬 最新社区动态</h2>
      <div class="post-preview-list">
        <RouterLink
          v-for="post in latestPosts"
          :key="post.id"
          :to="`/community/${post.id}`"
          class="post-preview"
        >
          <div class="post-preview-title">{{ post.title }}</div>
          <div class="post-preview-meta">
            <span>{{ post.username }}</span>
            <span>{{ formatTime(post.created_at) }}</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import CardItem from '../components/Card/CardItem.vue'
import cards from '../data/cards.json'
import health from '../data/health.json'
import { communityApi } from '../api/community'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const searchQuery = ref('')
const latestPosts = ref([])
const postCount = ref(0)

const filteredCards = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return cards
  return cards.filter(c =>
    (c.title && c.title.toLowerCase().includes(q)) ||
    (c.category && c.category.toLowerCase().includes(q)) ||
    (c.content && c.content.toLowerCase().includes(q))
  )
})

function goToSearch() {
  if (searchQuery.value.trim()) {
    router.push({ path: '/study', query: { q: searchQuery.value.trim() } })
  }
}

function formatTime(time) {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  auth.restoreUser()
  try {
    const posts = await communityApi.getPosts()
    latestPosts.value = posts.slice(0, 3)
    postCount.value = posts.length
  } catch (e) {
    postCount.value = 0
  }
})
</script>

<style scoped>
.hero {
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
  color: #fff;
  padding: 80px 20px 60px;
  text-align: center;
}
.hero-inner { max-width: 800px; margin: 0 auto; }
.hero-title {
  font-size: 2.5rem;
  margin-bottom: 16px;
  font-weight: 800;
  text-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.hero-subtitle { font-size: 1.1rem; opacity: 0.95; margin-bottom: 32px; }

.search-box {
  display: flex;
  max-width: 520px;
  margin: 0 auto 32px;
  background: #fff;
  border-radius: 50px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 12px 20px;
  font-size: 1rem;
  border-radius: 50px;
  background: transparent;
  color: var(--text);
}
.search-btn {
  border: none;
  background: var(--primary);
  color: #fff;
  width: 48px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.1rem;
  transition: transform 0.2s;
}
.search-btn:hover { transform: scale(1.05); }

.stats-row { display: flex; justify-content: center; gap: 48px; }
.stat { text-align: center; }
.stat strong { display: block; font-size: 1.8rem; font-weight: 800; }
.stat span { font-size: 0.9rem; opacity: 0.9; }

.quick-nav {
  max-width: 1200px;
  margin: 40px auto;
  padding: 0 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.quick-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  text-decoration: none;
  color: var(--text);
  font-weight: 600;
  transition: transform 0.2s, box-shadow 0.2s;
}
.quick-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.quick-icon { font-size: 1.6rem; }
.quick-card.study { border-left: 4px solid #3b82f6; }
.quick-card.health { border-left: 4px solid #8b5cf6; }
.quick-card.community { border-left: 4px solid #10b981; }
.quick-card.profile { border-left: 4px solid #f59e0b; }

.card-grid-section {
  padding: 40px 20px;
  max-width: 1200px;
  margin: 0 auto;
}
.section-title {
  text-align: center;
  margin-bottom: 30px;
  font-size: 1.5rem;
  color: var(--text);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
}
.empty-tip { text-align: center; color: var(--text-light); padding: 40px; }

.community-preview {
  padding: 40px 20px 60px;
  max-width: 800px;
  margin: 0 auto;
}
.post-preview-list { display: flex; flex-direction: column; gap: 12px; }
.post-preview {
  padding: 16px 20px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  text-decoration: none;
  color: var(--text);
  transition: transform 0.2s;
}
.post-preview:hover { transform: translateX(4px); }
.post-preview-title { font-weight: 600; margin-bottom: 6px; }
.post-preview-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-light);
}

@media (max-width: 640px) {
  .hero-title { font-size: 1.8rem; }
  .stats-row { gap: 24px; }
  .stat strong { font-size: 1.4rem; }
}
</style>
