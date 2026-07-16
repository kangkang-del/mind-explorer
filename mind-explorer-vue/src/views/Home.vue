<template>
  <main class="home-main">
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

          <article v-for="post in featuredPosts" :key="post.id" class="feature-card">
            <img v-if="post.image" :src="post.image" :alt="post.title" class="feature-card-img" loading="lazy" />
            <div class="feature-card-body">
              <span class="feature-card-tag">{{ catLabel(post.category) }}</span>
              <h3 class="feature-card-title">{{ post.title }}</h3>
              <p class="feature-card-desc">{{ post.content }}</p>
              <div class="feature-card-meta">
                <span class="feature-card-author">发布人：{{ post.author }}</span>
                <span>浏览数：{{ post.likes }}</span>
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
                随时与小木聊聊，获得温暖陪伴
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
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { communityApi } from '../api/community'

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
      title: p.title || '温暖推送',
      content: p.content,
      image: p.image,
      category: p.category || 'general',
      author: p.username || '匿名',
      likes: 0,
    }))

    try {
      const ids = posts.value.map((p) => p.id)
      const likeMap = await communityApi.getLikesBatch(ids)
      posts.value.forEach((p) => (p.likes = likeMap[p.id] || 0))
    } catch (e) {
      console.warn('获取点赞数失败', e)
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

onMounted(async () => {
  await loadPosts()
  await ensureTodayPush()
  startAuto()
})

onUnmounted(() => {
  stopAuto()
})
</script>

<style scoped>
.home-main {
  width: 100%;
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
}
</style>
