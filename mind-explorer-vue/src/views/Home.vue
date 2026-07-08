<template>
  <main class="main-content home">
    <!-- 漂浮装饰光斑（纯视觉，隐藏于无障碍树） -->
    <div class="deco" aria-hidden="true">
      <span class="blob blob-1"></span>
      <span class="blob blob-2"></span>
      <span class="blob blob-3"></span>
      <span class="blob blob-4"></span>
    </div>

    <!-- ============ Hero 区 ============ -->
    <section class="hero">
      <div class="hero-inner">
        <span class="hero-badge">🌱 用科学理解心灵</span>

        <h1 class="hero-title">
          用科学理解心灵<br />
          <span class="hero-title-accent">以知识温暖生活</span>
        </h1>

        <p class="hero-subtitle">
          96 张知识卡片 · 20 种心理疾病科普 · 16 位心理学家 · 18 个经典实验
        </p>

        <!-- 搜索框 -->
        <div class="search-box">
          <span class="search-ico">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索知识卡片、心理疾病、心理学家..."
            class="search-input"
            @keyup.enter="goToSearch"
          />
          <button class="search-btn" @click="goToSearch">探索</button>
        </div>

        <!-- 行动区：CTA + 治愈语 -->
        <div class="hero-actions">
          <RouterLink to="/study" class="cta-btn">开始探索 →</RouterLink>
          <button class="heal-pill" type="button" @click="nextQuote" :title="`点击换一句 · ${quoteIdx + 1}/${quotes.length}`">
            <span class="heal-dot"></span>{{ quotes[quoteIdx] }}
          </button>
        </div>

        <!-- 统计数字 -->
        <div class="stats-row">
          <div class="stat"><strong>{{ cards.length }}</strong><span>知识卡片</span></div>
          <div class="stat-divider"></div>
          <div class="stat"><strong>{{ health.length }}</strong><span>健康主题</span></div>
          <div class="stat-divider"></div>
          <div class="stat"><strong>{{ postCount }}</strong><span>社区帖子</span></div>
        </div>
      </div>
    </section>

    <!-- ============ 分类快捷入口 ============ -->
    <section class="quick-nav">
      <RouterLink to="/study" class="quick-card study" :style="{ '--d': '0ms' }">
        <span class="quick-icon">📚</span>
        <span class="quick-text">开始学习</span>
        <span class="quick-sub">96 张知识卡片</span>
      </RouterLink>
      <RouterLink to="/health" class="quick-card health" :style="{ '--d': '80ms' }">
        <span class="quick-icon">🧠</span>
        <span class="quick-text">了解心理</span>
        <span class="quick-sub">20 种健康主题</span>
      </RouterLink>
      <RouterLink to="/community" class="quick-card community" :style="{ '--d': '160ms' }">
        <span class="quick-icon">💬</span>
        <span class="quick-text">社区交流</span>
        <span class="quick-sub">倾诉与共鸣</span>
      </RouterLink>
      <RouterLink to="/user/profile" class="quick-card profile" v-if="auth.isLoggedIn" :style="{ '--d': '240ms' }">
        <span class="quick-icon">👤</span>
        <span class="quick-text">我的主页</span>
        <span class="quick-sub">贡献与记录</span>
      </RouterLink>
    </section>

    <!-- ============ 热门卡片 / 搜索结果 ============ -->
    <section class="card-grid-section" v-if="!searchQuery.trim()">
      <div class="section-head">
        <h2 class="section-title">🔥 热门知识卡片</h2>
        <RouterLink to="/study" class="see-all">查看全部 →</RouterLink>
      </div>
      <div class="card-grid">
        <div
          class="card-wrap"
          v-for="(card, i) in cards.slice(0, 12)"
          :key="card.id"
          :style="{ '--i': i }"
        >
          <CardItem :card="card" />
        </div>
      </div>
    </section>

    <section class="card-grid-section" v-else>
      <div class="section-head">
        <h2 class="section-title">搜索结果 ({{ filteredCards.length }})</h2>
        <button class="see-all" @click="searchQuery = ''">清除 ✕</button>
      </div>
      <div v-if="filteredCards.length" class="card-grid">
        <div
          class="card-wrap"
          v-for="(card, i) in filteredCards.slice(0, 24)"
          :key="card.id"
          :style="{ '--i': i }"
        >
          <CardItem :card="card" />
        </div>
      </div>
      <p v-else class="empty-tip">未找到相关内容，换个关键词试试 🌿</p>
    </section>

    <!-- ============ 最新社区动态 ============ -->
    <section class="community-preview" v-if="latestPosts.length">
      <div class="section-head">
        <h2 class="section-title">💬 最新社区动态</h2>
        <RouterLink to="/community" class="see-all">进入社区 →</RouterLink>
      </div>
      <div class="post-preview-list">
        <RouterLink
          v-for="post in latestPosts"
          :key="post.id"
          :to="`/community/${post.id}`"
          class="post-preview"
        >
          <div class="post-preview-title">{{ post.title }}</div>
          <div class="post-preview-meta">
            <span>👤 {{ post.username }}</span>
            <span>{{ formatTime(post.created_at) }}</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
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

/* 治愈语轮播 */
const quotes = [
  '此刻，允许自己只是存在。',
  '每一次呼吸，都是新的开始。',
  '你的感受是真实且合理的。',
  '温柔地对待自己，像对待好朋友。',
  '不需要每时每刻都坚强。',
  '情绪像天气，来去都自然。',
  '你已经做得很好了。',
  '深呼吸，这里很安全。',
]
const quoteIdx = ref(0)
let quoteTimer = null
function nextQuote() {
  quoteIdx.value = (quoteIdx.value + 1) % quotes.length
}

const filteredCards = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return cards
  return cards.filter(
    (c) =>
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
  return new Date(time).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(async () => {
  auth.restoreUser()
  nextQuote()
  quoteTimer = setInterval(nextQuote, 6000)
  try {
    const posts = await communityApi.getPosts()
    latestPosts.value = posts.slice(0, 3)
    postCount.value = posts.length
  } catch (e) {
    postCount.value = 0
  }
})

onUnmounted(() => {
  if (quoteTimer) clearInterval(quoteTimer)
})
</script>

<style scoped>
/* ============ 布局容器 ============ */
.home {
  position: relative;
  overflow: hidden;
}

/* ============ 漂浮装饰光斑 ============ */
.deco {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.55;
  animation: float 14s ease-in-out infinite;
}
.blob-1 {
  width: 280px;
  height: 280px;
  top: -60px;
  left: -40px;
  background: radial-gradient(circle at 30% 30%, #aee3d6, #7eb8a5);
  animation-duration: 16s;
}
.blob-2 {
  width: 220px;
  height: 220px;
  top: 40px;
  right: -30px;
  background: radial-gradient(circle at 30% 30%, #ffd0e0, #f6a5c0);
  animation-duration: 19s;
  animation-delay: -4s;
}
.blob-3 {
  width: 180px;
  height: 180px;
  bottom: 12%;
  left: 8%;
  background: radial-gradient(circle at 30% 30%, #cfe0ff, #9db4d6);
  animation-duration: 22s;
  animation-delay: -8s;
}
.blob-4 {
  width: 160px;
  height: 160px;
  bottom: 4%;
  right: 10%;
  background: radial-gradient(circle at 30% 30%, #fff0c2, #f8b88b);
  animation-duration: 17s;
  animation-delay: -2s;
}

/* ============ Hero ============ */
.hero {
  position: relative;
  z-index: 1;
  background: linear-gradient(135deg, #8ec5b9 0%, #a3c4d6 45%, #f7b2c4 100%);
  color: #fff;
  padding: 96px 20px 72px;
  text-align: center;
  overflow: hidden;
}
.hero::after {
  /* 顶部柔光，增强层次 */
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 80% at 50% -10%, rgba(255, 255, 255, 0.35), transparent 60%);
  pointer-events: none;
}
.hero-inner {
  position: relative;
  max-width: 820px;
  margin: 0 auto;
  animation: fadeUp 0.7s ease both;
}
.hero-badge {
  display: inline-block;
  padding: 6px 16px;
  margin-bottom: 20px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #2f5d54;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  backdrop-filter: blur(6px);
  animation: fadeUp 0.7s 0.05s ease both;
}
.hero-title {
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1.25;
  margin-bottom: 18px;
  font-weight: 800;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  animation: fadeUp 0.7s 0.12s ease both;
}
.hero-title-accent {
  background: linear-gradient(90deg, #fff, #fff7e6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero-subtitle {
  font-size: clamp(1rem, 2.4vw, 1.15rem);
  opacity: 0.96;
  margin-bottom: 30px;
  animation: fadeUp 0.7s 0.2s ease both;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 540px;
  margin: 0 auto 26px;
  background: #fff;
  border-radius: 50px;
  padding: 6px 6px 6px 18px;
  box-shadow: 0 10px 30px rgba(31, 60, 80, 0.22);
  transition: transform 0.25s, box-shadow 0.25s;
  animation: fadeUp 0.7s 0.28s ease both;
}
.search-box:focus-within {
  transform: translateY(-2px);
  box-shadow: 0 14px 38px rgba(31, 60, 80, 0.3);
}
.search-ico {
  font-size: 1.05rem;
  opacity: 0.6;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 12px 6px;
  font-size: 1rem;
  border-radius: 50px;
  background: transparent;
  color: var(--text);
}
.search-btn {
  border: none;
  background: linear-gradient(135deg, #7eb8a5, #5fa392);
  color: #fff;
  padding: 0 22px;
  height: 44px;
  border-radius: 50px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  transition: transform 0.2s, filter 0.2s;
}
.search-btn:hover {
  transform: scale(1.04);
  filter: brightness(1.05);
}

/* 行动区 */
.hero-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 34px;
  animation: fadeUp 0.7s 0.36s ease both;
}
.cta-btn {
  display: inline-block;
  padding: 13px 30px;
  background: #fff;
  color: #2f5d54;
  font-weight: 700;
  text-decoration: none;
  border-radius: 50px;
  box-shadow: 0 8px 22px rgba(31, 60, 80, 0.2);
  transition: transform 0.22s, box-shadow 0.22s;
}
.cta-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(31, 60, 80, 0.28);
}
.heal-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 0.95rem;
  border-radius: 50px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.25s, transform 0.2s;
  animation: breathe 4s ease-in-out infinite;
}
.heal-pill:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.02);
}
.heal-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
  animation: pulse 2.4s ease-out infinite;
}

/* 统计数字 */
.stats-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  animation: fadeUp 0.7s 0.44s ease both;
}
.stat {
  text-align: center;
  min-width: 84px;
}
.stat strong {
  display: block;
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 800;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.stat span {
  font-size: 0.9rem;
  opacity: 0.95;
}
.stat-divider {
  width: 1px;
  height: 34px;
  background: rgba(255, 255, 255, 0.5);
}

/* ============ 分类快捷入口 ============ */
.quick-nav {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 44px auto;
  padding: 0 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.quick-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 24px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  text-decoration: none;
  color: var(--text);
  overflow: hidden;
  transition: transform 0.25s, box-shadow 0.25s;
  animation: fadeUp 0.6s var(--d, 0ms) ease both;
}
.quick-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  border-radius: var(--radius) 0 0 var(--radius);
}
.quick-card.study::before { background: linear-gradient(#60a5fa, #3b82f6); }
.quick-card.health::before { background: linear-gradient(#a78bfa, #8b5cf6); }
.quick-card.community::before { background: linear-gradient(#34d399, #10b981); }
.quick-card.profile::before { background: linear-gradient(#fbbf24, #f59e0b); }
.quick-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-lg);
}
.quick-icon {
  font-size: 1.8rem;
  line-height: 1;
  transition: transform 0.25s;
}
.quick-card:hover .quick-icon {
  transform: scale(1.15) rotate(-4deg);
}
.quick-text {
  font-weight: 700;
  font-size: 1.05rem;
}
.quick-sub {
  font-size: 0.82rem;
  color: var(--text-light);
}

/* ============ 卡片网格区 ============ */
.card-grid-section {
  position: relative;
  z-index: 1;
  padding: 36px 20px;
  max-width: 1200px;
  margin: 0 auto;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
  flex-wrap: wrap;
  gap: 8px;
}
.section-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text);
}
.see-all {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--primary-dark);
  text-decoration: none;
  transition: color 0.2s, transform 0.2s;
}
.see-all:hover {
  color: var(--primary);
  transform: translateX(3px);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
}
.card-wrap {
  animation: fadeUp 0.5s calc(var(--i, 0) * 55ms) ease both;
  transition: transform 0.25s;
}
.card-wrap:hover {
  transform: translateY(-6px);
}
.empty-tip {
  text-align: center;
  color: var(--text-light);
  padding: 40px;
}

/* ============ 社区动态 ============ */
.community-preview {
  position: relative;
  z-index: 1;
  padding: 20px 20px 70px;
  max-width: 800px;
  margin: 0 auto;
}
.post-preview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.post-preview {
  padding: 16px 20px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  text-decoration: none;
  color: var(--text);
  border-left: 4px solid #10b981;
  transition: transform 0.22s, box-shadow 0.22s;
}
.post-preview:hover {
  transform: translateX(6px);
  box-shadow: var(--shadow-lg);
}
.post-preview-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.post-preview-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-light);
}

/* ============ 关键帧 ============ */
@keyframes float {
  0%, 100% { transform: translateY(0) translateX(0); }
  50% { transform: translateY(-26px) translateX(14px); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(22px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
  70% { box-shadow: 0 0 0 8px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
}

/* ============ 响应式 ============ */
@media (max-width: 900px) {
  .quick-nav { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .hero { padding: 72px 16px 56px; }
  .search-box { padding-left: 14px; }
  .search-btn { padding: 0 16px; height: 42px; }
  .stats-row { gap: 10px; }
  .stat { min-width: 70px; }
  .stat-divider { height: 28px; }
  .card-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .card-grid-section { padding: 28px 14px; }
  .community-preview { padding: 16px 14px 56px; }
}
@media (max-width: 420px) {
  .hero-actions { flex-direction: column; }
  .cta-btn, .heal-pill { width: 100%; justify-content: center; }
  .card-grid { grid-template-columns: 1fr; }
  .quick-nav { grid-template-columns: 1fr; }
}

/* 尊重无障碍：减少动态效果 */
@media (prefers-reduced-motion: reduce) {
  .blob, .heal-pill, .heal-dot { animation: none !important; }
  .hero-inner, .hero-badge, .hero-title, .hero-subtitle, .search-box,
  .hero-actions, .stats-row, .quick-card, .card-wrap {
    animation: none !important;
  }
}
</style>
