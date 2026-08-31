<template>
  <main class="home-main">
    <!-- 核心转化路径：同行者·小木 CTA 入口（深色重色锚点 + 对角线布局，按钮在右下符合 F 形阅读与拇指自然落点） -->
    <section class="xiaomu-hero">
      <div class="hero-content">
        <div class="hero-text">
          <span class="hero-eyebrow">24h 在这听你说</span>
          <h1 class="hero-title">不想一个人扛着吗？</h1>
          <p class="hero-subtitle">小木，心理学家与哲学家。<br />陪你理一理、缓一缓、慢下来。</p>
        </div>
        <div class="hero-action">
          <RouterLink to="/companion" class="hero-cta-btn">
            <span>陪小木聊聊</span>
            <span class="hero-arrow">→</span>
          </RouterLink>
          <p class="hero-hint">免费 · 无需注册 · 随时可走</p>
        </div>
      </div>
      <div class="hero-orb" aria-hidden="true"></div>
      <div class="hero-orb hero-orb-2" aria-hidden="true"></div>
    </section>

    <!-- 轮播图：心理晴天每日推送/治愈图片 -->
    <section class="carousel" @mouseenter="pauseAuto" @mouseleave="resumeAuto">
      <div class="carousel-track" :style="trackStyle">
        <div v-for="(slide, i) in slides" :key="i" class="carousel-slide">
          <img :src="slide.image" :alt="slide.title" class="carousel-image" loading="lazy" />
          <div class="carousel-overlay">
            <span class="carousel-tag">心理晴天 · {{ catLabel(slide.category) }}</span>
            <h2 class="carousel-title">{{ slide.title }}</h2>
            <p class="carousel-desc">{{ slide.content }}</p>
          </div>
        </div>
      </div>

      <button class="carousel-arrow carousel-prev" @click="prevSlide" aria-label="上一张">‹</button>
      <button class="carousel-arrow carousel-next" @click="nextSlide" aria-label="下一张">›</button>

      <div class="carousel-dots">
        <span
          v-for="(_, i) in slides"
          :key="i"
          :class="{ active: current === i }"
          @click="goTo(i)"
          :aria-label="`第 ${i + 1} 张`"
        ></span>
      </div>
    </section>

    <!-- 今日精选：中间内容、两边空白 -->
    <section class="today-feature">
      <div class="feature-header">
        <div class="feature-title-group">
          <h2 class="feature-title">今日精选</h2>
          <p class="feature-subtitle">来自心理晴天的温暖推送</p>
        </div>
        <div class="feature-stats">
          <span>1200+ 次浏览</span>
          <span>100+ 温暖推送</span>
        </div>
      </div>

      <div class="feature-grid">
        <!-- 左侧主内容：文章卡片 -->
        <div class="feature-main">
          <p v-if="loading" class="feature-loading">正在加载今日精选… ☀️</p>

          <article v-for="post in featuredPosts" :key="post.id" class="feature-card" role="button" tabindex="0" @click="openModal(post)" @keydown.enter="openModal(post)">
            <img v-if="post.image" :src="post.image" :alt="post.title" class="feature-card-img" loading="lazy" />
            <div class="feature-card-body">
              <span class="feature-card-tag">{{ catLabel(post.category) }}</span>
              <h3 class="feature-card-title">{{ post.title }}</h3>
              <p class="feature-card-desc">{{ post.content }}</p>
              <div class="feature-card-meta">
                <span class="feature-card-author">发布人：{{ post.author }}</span>
                <span class="feature-card-stats">💖 {{ post.likes }} 人觉得温暖 · 点击查看详情</span>
              </div>
            </div>
          </article>

          <p v-if="!loading && !featuredPosts.length" class="feature-empty">
            暂无精选内容，去「心灵晴天」看看吧 ☀️
          </p>
        </div>

        <!-- 右侧公告信息 -->
        <aside class="feature-sidebar">
          <div class="notice-box">
            <h3 class="notice-title">公告信息</h3>
            <ul class="notice-list">
              <li>
                <strong>【今日晴天已更新】</strong><br />
                心理晴天已为你推送今日治愈内容
              </li>
              <li>
                <strong>【小木 AI 上线】</strong><br />
                与小木——心理学家与哲学家聊聊，获得温柔而坚韧的陪伴
              </li>
              <li>
                <strong>【社区交流开启】</strong><br />
                欢迎分享你的心情与温暖瞬间
              </li>
              <li>
                <strong>【反馈渠道】</strong><br />
                有建议欢迎到反馈与建议页告诉我们
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>

    <!-- 文章详情 Modal -->
    <Teleport to="body">
      <div v-if="activePost" class="post-modal-overlay" @click.self="closeModal" @keydown.esc="closeModal" tabindex="-1">
        <div class="post-modal" role="dialog" aria-modal="true">
          <button class="post-modal-close" @click="closeModal" aria-label="关闭">×</button>
          <img v-if="activePost.image" :src="activePost.image" :alt="activePost.title" class="post-modal-img" />
          <div class="post-modal-body">
            <div class="post-modal-meta">
              <span class="post-modal-tag">{{ catLabel(activePost.category) }}</span>
              <span class="post-modal-author">发布人：{{ activePost.author }}</span>
            </div>
            <h3 class="post-modal-title">{{ activePost.title }}</h3>
            <p class="post-modal-content">{{ activePost.content }}</p>
            <div class="post-modal-actions">
              <button @click="toggleLike(activePost)" class="post-like-btn" :class="{ liked: activePost.liked }">
                <span class="like-icon">❤️</span>
                <span class="like-count">{{ activePost.likes }}</span>
              </button>
              <FavoriteButton type="post" :id="activePost.id" :title="activePost.title" :summary="(activePost.content || '').slice(0, 60)" link="" />
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { communityApi } from '../api/community'
import { useAuthStore } from '../stores/auth'
import FavoriteButton from '../components/FavoriteButton.vue'

const auth = useAuthStore()
const activePost = ref(null)
const posts = ref([])
const loading = ref(true)
const current = ref(0)
let timer = null

function catLabel(k) {
  const map = {
    cat: '猫狗',
    dog: '猫狗',
    kindness: '善意',
    nature: '环境',
    quote: '小木语录',
    general: '其他',
  }
  return map[k] || k
}

const slides = computed(() => {
  const withImg = posts.value.filter((p) => p.image).slice(0, 5)
  if (withImg.length >= 2) return withImg
  return [
    {
      image: 'https://picsum.photos/seed/heal1/1200/420',
      title: '周末心灵疗愈之旅',
      content: '找回内心的宁静与美好',
      category: 'nature',
    },
    {
      image: 'https://picsum.photos/seed/heal2/1200/420',
      title: '在微光中前行',
      content: '每一缕阳光都是温柔的力量',
      category: 'nature',
    },
    {
      image: 'https://picsum.photos/seed/heal3/1200/420',
      title: '与自然温柔相拥',
      content: '让心灵在绿意中慢慢舒展',
      category: 'nature',
    },
  ]
})

const featuredPosts = computed(() => posts.value.slice(0, 4))

const trackStyle = computed(() => ({
  transform: `translateX(-${current.value * 100}%)`,
}))

function nextSlide() {
  if (!slides.value.length) return
  current.value = (current.value + 1) % slides.value.length
}
function prevSlide() {
  if (!slides.value.length) return
  current.value = (current.value - 1 + slides.value.length) % slides.value.length
}
function goTo(i) {
  current.value = i
}

function startAuto() {
  stopAuto()
  timer = setInterval(nextSlide, 5000)
}
function stopAuto() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
function pauseAuto() {
  stopAuto()
}
function resumeAuto() {
  startAuto()
}

async function loadPosts() {
  loading.value = true
  try {
    const raw = await communityApi.getPosts()
    posts.value = raw.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title || '温暖推送',
      content: p.content,
      image: p.image,
      category: p.category || 'general',
      author: p.username || '匿名',
      likes: 0,
      liked: false,
    }))

    const ids = posts.value.map((p) => p.id)
    // 批量点赞数
    try {
      const likeMap = await communityApi.getLikesBatch(ids)
      posts.value.forEach((p) => (p.likes = likeMap[p.id] || 0))
    } catch (e) {
      console.warn('获取点赞数失败', e)
    }

    // 当前用户已认同的状态
    const me = auth.currentUser
    if (me) {
      const myId = me.type === 'github' ? me.username : me.id
      try {
        const likedIds = new Set(await communityApi.myLikes(ids, myId))
        posts.value.forEach((p) => (p.liked = likedIds.has(p.id)))
      } catch (e) {
        console.warn('获取我的认同失败', e)
      }
    }
  } catch (e) {
    console.error('加载首页数据失败', e)
    posts.value = []
  } finally {
    loading.value = false
  }
}

// 兜底：若今日尚无自动推送，尝试触发一次
async function ensureTodayPush() {
  const hasAuto = posts.value.some((p) => p.isAutoPush || p.type === 'auto' || p.type === 'xiaomu')
  if (hasAuto) return
  try {
    const res = await communityApi.triggerSunnyPush()
    if (res && res.pushed) {
      await loadPosts()
    }
  } catch (e) {
    console.warn('兜底推送未触发（可忽略，定时任务会补）', e)
  }
}

function openModal(post) {
  activePost.value = post
  if (typeof document !== 'undefined') document.body.style.overflow = 'hidden'
}
function closeModal() {
  activePost.value = null
  if (typeof document !== 'undefined') document.body.style.overflow = ''
}
function onKeyDown(e) {
  if (e.key === 'Escape' && activePost.value) closeModal()
}
async function toggleLike(post) {
  const me = auth.currentUser
  if (!me) {
    alert('请先登录后再觉得温暖 ❤️')
    return
  }
  const before = post.liked
  post.liked = !post.liked
  post.likes += post.liked ? 1 : -1
  try {
    await communityApi.toggleLike(post.id, me)
  } catch (e) {
    console.error('认同失败', e)
    post.liked = before
    post.likes += before ? 1 : -1
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  await loadPosts()
  await ensureTodayPush()
  startAuto()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
  stopAuto()
})
</script>

<style scoped>
.home-main {
  width: 100%;
}

/* 小木 CTA Hero（核心转化锚点，深色重色 + 对角线布局） */
.xiaomu-hero {
  position: relative;
  width: 100%;
  margin: 0 auto 28px;
  padding: 56px 40px 52px;
  background: linear-gradient(135deg, #2d4258 0%, #3a5068 60%, #2c3e54 100%);
  border-radius: 24px;
  overflow: hidden;
  color: #fff;
  box-shadow: 0 14px 44px rgba(45, 66, 88, 0.28);
}
.hero-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
}
.hero-text {
  flex: 1;
  min-width: 280px;
}
.hero-eyebrow {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1.5px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  margin-bottom: 16px;
  backdrop-filter: blur(4px);
}
.hero-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 14px;
  line-height: 1.3;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}
.hero-subtitle {
  font-size: 15.5px;
  opacity: 0.88;
  margin: 0;
  line-height: 1.7;
  max-width: 480px;
}
.hero-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.hero-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #e07a3f 0%, #f0a868 100%);
  color: #fff;
  padding: 16px 30px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  box-shadow: 0 8px 24px rgba(224, 122, 63, 0.4);
}
.hero-cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(224, 122, 63, 0.55);
  background: linear-gradient(135deg, #e98a4f 0%, #f5b378 100%);
}
.hero-arrow {
  font-size: 20px;
  transition: transform 0.25s ease;
}
.hero-cta-btn:hover .hero-arrow {
  transform: translateX(4px);
}
.hero-hint {
  font-size: 12px;
  opacity: 0.6;
  margin: 0;
}
.hero-orb {
  position: absolute;
  top: -80px;
  right: -80px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(224, 122, 63, 0.18) 0%, transparent 60%);
  border-radius: 50%;
  z-index: 1;
  pointer-events: none;
}
.hero-orb-2 {
  top: auto;
  bottom: -120px;
  left: -80px;
  right: auto;
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, rgba(168, 213, 186, 0.16) 0%, transparent 60%);
}
@media (max-width: 768px) {
  .xiaomu-hero {
    padding: 36px 24px 32px;
  }
  .hero-title {
    font-size: 24px;
  }
  .hero-action {
    align-items: flex-start;
    width: 100%;
  }
}

/* 轮播图 */
/* 通栏轮播：铺满整屏宽度（两侧到边），下方内容区才居中留白 */
.carousel {
  position: relative;
  left: 50%;
  transform: translateX(-50%);
  width: 100vw;
  height: 360px;
  overflow: hidden;
  margin-bottom: 32px;
}
.carousel-track {
  display: flex;
  height: 100%;
  transition: transform 0.5s ease;
}
.carousel-slide {
  min-width: 100%;
  position: relative;
}
.carousel-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.carousel-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 48px 40px 48px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.1), transparent);
  color: #fff;
}
.carousel-tag {
  display: inline-block;
  background: rgba(255, 255, 255, 0.25);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  backdrop-filter: blur(4px);
}
.carousel-title {
  font-size: 32px;
  font-weight: 700;
  margin: 12px 0 8px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.carousel-desc {
  font-size: 16px;
  opacity: 0.95;
  margin: 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.85);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 22px;
  color: #3a4a5c;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: background 0.2s;
}
.carousel-arrow:hover {
  background: #fff;
}
.carousel-prev {
  left: 16px;
}
.carousel-next {
  right: 16px;
}
.carousel-dots {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
}
.carousel-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.2s;
}
.carousel-dots span.active {
  background: #fff;
}

/* 今日精选 */
.today-feature {
  width: 100%;
}
.feature-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.feature-title {
  font-size: 22px;
  font-weight: 700;
  color: #3a4a5c;
  margin: 0;
  position: relative;
  padding-left: 12px;
}
.feature-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  background: #7c9cb8;
  border-radius: 2px;
}
.feature-subtitle {
  color: #9aa6b2;
  font-size: 14px;
  margin: 4px 0 0;
}
.feature-stats {
  font-size: 13px;
  color: #7c9cb8;
  display: flex;
  gap: 12px;
}
.feature-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}
.feature-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.feature-loading,
.feature-empty {
  text-align: center;
  color: #9aa6b2;
  padding: 32px 0;
  margin: 0;
  background: #fff;
  border: 1px dashed #e0e6ec;
  border-radius: 16px;
}
.feature-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 16px;
  transition: box-shadow 0.2s, transform 0.2s;
  cursor: pointer;
}
.feature-card:active {
  transform: translateY(0);
}
.feature-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}
.feature-card-img {
  width: 180px;
  height: 120px;
  object-fit: cover;
  border-radius: 12px;
  flex-shrink: 0;
}
.feature-card-body {
  flex: 1;
  min-width: 0;
}
.feature-card-tag {
  display: inline-block;
  font-size: 11px;
  color: #e07a3f;
  background: #fff3e0;
  padding: 2px 8px;
  border-radius: 12px;
}
.feature-card-title {
  font-size: 17px;
  font-weight: 700;
  color: #3a4a5c;
  margin: 8px 0 6px;
}
.feature-card-desc {
  font-size: 13px;
  color: #5a6b7c;
  margin: 0 0 10px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.feature-card-meta {
  font-size: 12px;
  color: #9aa6b2;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.feature-card-stats {
  margin-left: auto;
  color: #7c9cb8;
}

/* 文章详情 Modal */
.post-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: post-modal-fade 0.18s ease;
  outline: none;
}
.post-modal {
  background: #fff;
  border-radius: 18px;
  max-width: 560px;
  width: 100%;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  position: relative;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
  animation: post-modal-pop 0.22s ease;
}
.post-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border: 0;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  color: #3a4a5c;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: color 0.2s;
}
.post-modal-close:hover {
  color: #e07a3f;
}
.post-modal-img {
  width: 100%;
  height: 280px;
  object-fit: cover;
  border-radius: 18px 18px 0 0;
  display: block;
}
.post-modal-body {
  padding: 24px 24px 20px;
}
.post-modal-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.post-modal-tag {
  display: inline-block;
  font-size: 11px;
  color: #e07a3f;
  background: #fff3e0;
  padding: 3px 10px;
  border-radius: 12px;
}
.post-modal-author {
  font-size: 12px;
  color: #9aa6b2;
}
.post-modal-title {
  font-size: 22px;
  font-weight: 700;
  color: #3a4a5c;
  margin: 0 0 12px;
  line-height: 1.4;
}
.post-modal-content {
  font-size: 14.5px;
  color: #5a6b7c;
  line-height: 1.7;
  margin: 0 0 20px;
  white-space: pre-wrap;
}
.post-modal-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid #eef2f7;
}
.post-like-btn {
  background: #fff;
  border: 1px solid #eef2f7;
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  font-size: 14px;
  color: #5a6b7c;
}
.post-like-btn:hover {
  border-color: #f0a868;
}
.post-like-btn.liked {
  color: #e07a3f;
  border-color: #f0a868;
  background: #fff3e0;
}
.like-icon {
  font-size: 16px;
}
.like-count {
  font-weight: 600;
}

@keyframes post-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes post-modal-pop {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.feature-sidebar {
  position: sticky;
  top: 80px;
}
.notice-box {
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 16px;
  padding: 20px;
}
.notice-title {
  font-size: 16px;
  font-weight: 700;
  color: #3a4a5c;
  margin: 0 0 14px;
  text-align: center;
}
.notice-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.notice-list li {
  font-size: 13px;
  color: #5a6b7c;
  padding: 12px 0;
  border-bottom: 1px dashed #eef2f7;
  line-height: 1.5;
}
.notice-list li:last-child {
  border-bottom: none;
}
.notice-list strong {
  color: #3a4a5c;
}

/* 平板及以下（<=1024px）：两栏折叠为单栏，公告信息落到内容下方 */
@media (max-width: 1024px) {
  .feature-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .feature-sidebar {
    position: static;
  }
  .feature-stats {
    width: 100%;
  }
  .carousel {
    height: 300px;
  }
}

/* 手机（<=768px） */
@media (max-width: 768px) {
  .carousel {
    height: 240px;
  }
  .carousel-title {
    font-size: 22px;
  }
  .carousel-desc {
    font-size: 14px;
  }
  .carousel-overlay {
    padding: 28px 24px 32px;
  }
  .feature-header {
    align-items: flex-start;
  }
  .feature-card {
    flex-direction: column;
  }
  .feature-card-img {
    width: 100%;
    height: 160px;
  }
}

/* 超小屏（<=480px） */
@media (max-width: 480px) {
  .carousel {
    height: 200px;
  }
  .carousel-title {
    font-size: 18px;
  }
  .carousel-desc {
    font-size: 13px;
  }
  .carousel-overlay {
    padding: 20px 16px 24px;
  }
  .carousel-arrow {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }
  .carousel-prev {
    left: 10px;
  }
  .carousel-next {
    right: 10px;
  }
  .feature-title {
    font-size: 19px;
  }
  .feature-card-title {
    font-size: 16px;
  }
  .post-modal-img {
    height: 200px;
  }
  .post-modal-body {
    padding: 18px;
  }
  .post-modal-title {
    font-size: 18px;
  }
}
</style>
