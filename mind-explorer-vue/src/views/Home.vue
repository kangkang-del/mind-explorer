<template>
  <section class="home-main">
    <!-- 核心转化路径：同行者·小木 CTA 入口（浅色山川 Hero + 深蓝文字，主 CTA 纯色 #345B8E） -->
    <section class="xiaomu-hero">
      <!-- 桌面 12 栅格 7:5；1024–1279 收成 6:6；平板同样 6:6；手机单列 -->
      <div class="hero-content">
        <div class="hero-text">
          <h1 class="hero-title">不想一个人扛着吗？</h1>
          <p class="hero-subtitle">在这里，探索内心的世界，找到属于自己的方向。</p>
          <div class="hero-action">
            <RouterLink to="/companion" class="hero-cta-btn">
              <span>陪小木聊聊</span>
              <span class="hero-arrow">→</span>
            </RouterLink>
            <p class="hero-hint">免费 · 无需注册 · 随时可走</p>
          </div>
        </div>

        <!-- 路线图：四个入口路标（同行者 / 知识 / 日记 / 工具）。
             这是「首屏就知道产品能做什么」的关键，不是装饰。 -->
        <nav class="hero-markers" aria-label="快速开始">
          <RouterLink
            v-for="m in heroMarkers"
            :key="m.to"
            :to="m.to"
            class="hero-marker"
          >
            <span class="hero-marker-icon" aria-hidden="true">{{ m.icon }}</span>
            <span class="hero-marker-body">
              <span class="hero-marker-title">{{ m.title }}</span>
              <span class="hero-marker-desc">{{ m.desc }}</span>
            </span>
            <span class="hero-marker-arrow" aria-hidden="true">→</span>
          </RouterLink>
        </nav>
      </div>
      <!-- 插画 = 用户 2026-11-12 提供的占位资产（正式资产仍需评审）。
           桌面走 CSS 背景（左文右景）；手机端用下面这个上层画幅做 §4.2.2「上下分层」，
           画中的路牌与山径就是分册一 §7.2「路线图」的地图隐喻 -->
      <div class="hero-art" aria-hidden="true">
        <img :src="heroAtlas" alt="" />
      </div>
    </section>

    <!-- 快速开始（交接文档 §4.3）：三张低门槛行动卡，手机端展示；桌面入口在 Hero 路标 -->
    <section class="quick-start" aria-label="从此刻开始">
      <h2 class="quick-start-title">从此刻开始</h2>
      <div class="quick-start-cards">
        <RouterLink to="/companion" class="qs-card">
          <span class="qs-icon" aria-hidden="true">💬</span>
          <span class="qs-title">找个人聊聊</span>
          <span class="qs-desc">和小木说说现在的感受</span>
        </RouterLink>
        <RouterLink to="/tools" class="qs-card">
          <span class="qs-icon" aria-hidden="true">🌿</span>
          <span class="qs-title">先缓一缓</span>
          <span class="qs-desc">使用呼吸等自助工具</span>
        </RouterLink>
        <RouterLink to="/mood" class="qs-card">
          <span class="qs-icon" aria-hidden="true">📝</span>
          <span class="qs-title">记录一下</span>
          <span class="qs-desc">写下现在的心情</span>
        </RouterLink>
      </div>
    </section>

    <!-- 轮播图：心理晴天每日推送/治愈图片 -->
    <section class="carousel" @mouseenter="pauseAuto" @mouseleave="resumeAuto">
      <div class="carousel-track" :style="trackStyle">
        <div v-for="(slide, i) in slides" :key="i" class="carousel-slide">
          <img :src="slide.image" :alt="slide.title" class="carousel-image" loading="lazy" />
          <div class="carousel-overlay">
            <span class="carousel-tag">治愈瞬间 · {{ catLabel(slide.category) }}</span>
            <h2 class="carousel-title">{{ slide.title }}</h2>
            <p class="carousel-desc">{{ slide.content }}</p>
          </div>
        </div>
      </div>

      <button class="border-0 carousel-arrow carousel-prev" @click="prevSlide" aria-label="上一张">‹</button>
      <button class="border-0 carousel-arrow carousel-next" @click="nextSlide" aria-label="下一张">›</button>

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
          <p class="feature-subtitle">来自心灵晴天的每日推送，每天自动换新</p>
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
                心灵晴天已为你推送今日治愈内容
              </li>
              <li>
                <strong>【小木 AI 上线】</strong><br />
                与小木——研究心理学与哲学的同行者聊聊，获得温柔而坚韧的陪伴
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

    <!-- 心理知识推荐（交接文档 §4.5）：来自现有知识库，横向滑动露出下一张，必须提供查看全部 -->
    <section class="knowledge-strip" aria-label="心理知识推荐">
      <div class="ks-head">
        <h2 class="ks-title">认识自己，从了解心理开始。</h2>
        <RouterLink to="/knowledge" class="ks-more">查看全部 →</RouterLink>
      </div>
      <div class="ks-row">
        <RouterLink v-for="k in knowledgePicks" :key="k.id" to="/knowledge" class="ks-card">
          <span class="ks-tag">{{ k.category }}</span>
          <span class="ks-name">{{ k.title }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- 结束引导（交接文档 §4.7）；页脚热线卡在全局 AppFooter，不在此重复 -->
    <section class="home-ending" aria-label="结束引导">
      <p class="home-ending-title">每一次探索，都是更好的开始。</p>
      <p class="home-ending-sub">不用急着找到答案，慢慢来就好。</p>
    </section>

    <!-- 文章详情 Modal -->
    <Teleport to="body">
      <div v-if="activePost" class="post-modal-overlay" @click.self="closeModal" @keydown.esc="closeModal" tabindex="-1">
        <div class="post-modal" role="dialog" aria-modal="true">
          <button class="border-0 post-modal-close" @click="closeModal" aria-label="关闭">×</button>
          <img v-if="activePost.image" :src="activePost.image" :alt="activePost.title" class="post-modal-img" />
          <div class="post-modal-body">
            <div class="post-modal-meta">
              <span class="post-modal-tag">{{ catLabel(activePost.category) }}</span>
              <span class="post-modal-author">发布人：{{ activePost.author }}</span>
            </div>
            <h3 class="post-modal-title">{{ activePost.title }}</h3>
            <p class="post-modal-content">{{ activePost.content }}</p>
            <div class="post-modal-actions">
              <button @click="toggleLike(activePost)" class="border-0 post-like-btn" :class="{ liked: activePost.liked }">
                <span class="like-icon">❤️</span>
                <span class="like-count">{{ activePost.likes }}</span>
              </button>
              <FavoriteButton type="post" :id="activePost.id" :title="activePost.title" :summary="(activePost.content || '').slice(0, 60)" link="" />
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import cardsRaw from '../data/cards.json'
import heroAtlas from '../assets/hero-atlas.jpg'
import { communityApi } from '../api/community'
import { userCardsApi } from '../api/userCards'
import { useAuthStore } from '../stores/auth'
import FavoriteButton from '../components/FavoriteButton.vue'

const auth = useAuthStore()
const activePost = ref(null)
const posts = ref([])
const carouselPool = ref([]) // 治愈瞬间带图卡片池（user_cards approved + image）
const loading = ref(true)
const current = ref(0)
let timer = null

// ---------- 0012：每日换新工具（北京时间的日种子，同日稳定、跨天自动换） ----------
function dayKey() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}
function hashStr(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
// 用日种子从候选池里确定性地选 count 项（去重）；池子不足则全返回
function dailyPick(arr, count) {
  if (!arr || !arr.length) return []
  const seed = hashStr(dayKey())
  const pool = [...arr]
  const picked = []
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = (seed + i * 131 + hashStr(String(i))) % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

function catLabel(k) {
  const map = {
    cat: '猫狗',
    dog: '猫狗',
    kindness: '善意',
    nature: '环境',
    quote: '小木语录',
    general: '日常',
    暖心: '暖心',
    成长: '成长',
    小确幸: '小确幸',
    树洞: '树洞',
    其他: '日常',
  }
  return map[k] || k || '日常'
}

// 轮播（0012：从「治愈瞬间 + 每日推送图」按日种子选取；无候选时回退静态图）
// 心理知识推荐（交接文档 §4.5）：取自现有知识库前 8 条，横向滑动露出下一张
const knowledgePicks = cardsRaw.slice(0, 8)

// 路线图路标：桌面首屏的四个入口（同行者 / 知识 / 日记 / 工具）
const heroMarkers = [
  { to: '/companion', icon: '💬', title: '同行者', desc: '和小木说说心里话' },
  { to: '/knowledge', icon: '📚', title: '心理知识', desc: '读懂那些行为与偏差' },
  { to: '/mood', icon: '☁️', title: '心情日记', desc: '记下此刻的感受' },
  { to: '/tools', icon: '🧰', title: '自助工具', desc: '呼吸练习与紧急求助' },
]

const slides = computed(() => {
  if (carouselPool.value.length) {
    return dailyPick(carouselPool.value, 5)
  }
  // 兜底：站点刚上线、还没有治愈内容图时使用
  return [
    {
      image: 'https://picsum.photos/seed/heal1/1200/420',
      title: '周末心灵疗愈之旅',
      content: '找回内心的宁静与美好',
      category: 'nature',
      author: '小木',
    },
    {
      image: 'https://picsum.photos/seed/heal2/1200/420',
      title: '在微光中前行',
      content: '每一缕阳光都是温柔的力量',
      category: 'nature',
      author: '小木',
    },
    {
      image: 'https://picsum.photos/seed/heal3/1200/420',
      title: '与自然温柔相拥',
      content: '让心灵在绿意中慢慢舒展',
      category: 'nature',
      author: '小木',
    },
  ]
})

// 今日精选（0012：从「心灵晴天」每日推送里按日种子选 3 条，每天自动换新）
const featuredPosts = computed(() => {
  const pushPosts = posts.value.filter((p) => p.isAutoPush || p.type === 'auto' || p.type === 'xiaomu')
  const picked = dailyPick(pushPosts, 3)
  return picked.length ? picked : posts.value.slice(0, 3)
})

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

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function startAuto() {
  stopAuto()
  // 用户要求减少动态效果时不再自动轮播，改为手动切换
  if (prefersReducedMotion()) return
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
      isAutoPush: !!p.is_auto_push,
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

// 0012：拉取「治愈瞬间」图池供首页轮播按日换新。
// 数据源 = 治愈瞬间带图卡（user_cards approved，用户上传/小木名义）+ 心灵晴天每日图帖
// （community_posts auto 推送的 dog/cat/nature 等）。两源都统一成 {image,title,content,category,author}。
async function loadCarousel() {
  try {
    const [cards, posts] = await Promise.all([
      userCardsApi.getApproved(80),
      communityApi.getPosts(),
    ])
    const cardItems = cards
      .filter((c) => c.image && c.image.trim())
      .map((c) => ({
        image: c.image,
        title: c.title,
        content: c.content,
        category: c.category || '暖心',
        author: c.author_name || '匿名',
      }))
    const postItems = posts
      .filter((p) => p.image && (p.is_auto_push || p.type === 'auto'))
      .map((p) => ({
        image: p.image,
        title: p.title,
        content: p.content,
        category: p.category || 'general',
        author: p.username || '系统推送',
      }))
    carouselPool.value = [...cardItems, ...postItems]
  } catch (e) {
    console.warn('加载治愈瞬间轮播池失败（使用静态兜底图）', e)
    carouselPool.value = []
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
  await Promise.all([loadPosts(), loadCarousel()])
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

/* 小木 CTA Hero（核心转化锚点，插画背景 + 深蓝文字；插画 = 用户 2026-11-12 提供的占位资产） */
.xiaomu-hero {
  position: relative;
  width: 100%;
  margin: 0 auto 28px;
  padding: 56px 40px 64px;
  /* 桌面：左侧文字区用白色渐变让白（最左 0.95 保证 4.5:1+），
     插画主体（人物/小木/日出/远山）在右侧中景与路标后面透出来 */
  background-color: #DFEBF7;
  background-image:
    linear-gradient(88deg, rgba(250, 251, 253, 0.96) 0%, rgba(250, 251, 253, 0.86) 30%, rgba(250, 251, 253, 0.45) 52%, rgba(250, 251, 253, 0.06) 74%),
    url('../assets/hero-atlas.jpg');
  background-size: auto, cover;
  background-position: left, center 30%;
  background-repeat: no-repeat;
  border-radius: 24px;
  overflow: hidden;
  color: #263746;
  box-shadow: 0 10px 30px rgba(52, 91, 142, 0.1);
}
/* 手机端专用画幅：桌面走背景，这里默认隐藏 */
.hero-art {
  display: none;
}
.hero-content {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
  align-items: center;
}
/* 平板与 1024–1279 小桌面：6:6（手册允许，避免 7:5 在窄宽度下过窄） */
@media (min-width: 768px) {
  .hero-content {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 36px;
  }
}
/* ≥1280 完整桌面：12 栅格 7:5 */
@media (min-width: 1280px) {
  .hero-content {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 48px;
  }
}
.hero-text {
  min-width: 0;
}
.hero-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 14px;
  line-height: 1.3;
  letter-spacing: 0.5px;
  /* 原全局 .hero-title 带 max-width:640px，删掉全局规则后由这里接管 */
  max-width: 640px;
  /* 交接文档 §4.2.1：深蓝文字（显式声明，防全局旧规则回压） */
  color: #263746;
}
.hero-subtitle {
  font-size: 15.5px;
  margin: 0;
  line-height: 1.7;
  max-width: 480px;
  /* 交接文档 §4.2.1：辅助文字用次级可读色 */
  color: #5A6B7C;
  /* 原全局 .hero-subtitle 带 letter-spacing:0.04em */
  letter-spacing: 0.04em;
}
.hero-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 22px;
}

/* 路线图路标：桌面首屏的四个入口 */
.hero-markers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  min-width: 0;
}
.hero-marker {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 12px 14px;
  background: #FFFFFF;
  border: 1px solid #E6EAF0;
  border-radius: 14px;
  color: #263746;
  text-decoration: none;
  box-shadow: 0 4px 14px rgba(52, 91, 142, 0.08);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.hero-marker:hover {
  border-color: rgba(52, 91, 142, 0.35);
  transform: translateY(-2px);
}
.hero-marker-icon {
  font-size: 20px;
  line-height: 1;
  flex: none;
}
.hero-marker-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hero-marker-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
.hero-marker-desc {
  font-size: 11.5px;
  line-height: 1.4;
  color: #5A6B7C;
}
/* 手机端（分册三）：Hero 不放路标，改用下方「从此刻开始」三卡 */
@media (max-width: 767px) {
  .hero-markers { display: none; }
}
.hero-marker-arrow {
  margin-left: auto;
  opacity: 0.6;
  font-size: 14px;
  flex: none;
}
.hero-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  /* 主操作一律纯色 color.brand.primary #345B8E，不用渐变；
     此前误用紧急色 #D87945 做渐变，已纠正 */
  background: #345B8E;
  color: #fff;
  padding: 16px 30px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
  box-shadow: 0 8px 24px rgba(52, 91, 142, 0.32);
}
.hero-cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(52, 91, 142, 0.42);
  background: #2C4E7E;
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
  color: #5A6B7C;
  margin: 0;
}
@media (max-width: 768px) {
  /* 交接文档 §4.2.2「上下分层」：上部 150px 画幅（object-position 取人物/小木中带），
     下部文字落在纯浅底上——不用背景渐变兜底，人物不会被文字区盖住 */
  .xiaomu-hero {
    padding: 158px 22px 30px;
    background-image: none;
    background-color: #F4F8FC;
  }
  .hero-art {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 150px;
    overflow: hidden;
  }
  .hero-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 32% 68%;
  }
  .hero-title {
    font-size: 26px; /* 交接文档 §4.2.1：标题 25–28px */
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
  /* 图片没加载出来（网络慢、404、被拦截）时不能整块塌掉：
     给一层深色底，保证叠在上面的白字始终可读。
     这条是兜底，不是装饰 —— 之前图片一失败就变成「白字压浅灰」，完全看不见。 */
  background: linear-gradient(135deg, #2d4258 0%, #3a5068 100%);
}
.carousel-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* 轮播高度固定：精选内容不该在首屏里无限长，也不能随图片尺寸跳动 */
.carousel-slide {
  height: 250px;
}
@media (min-width: 768px) {
  .carousel-slide {
    height: 320px;
  }
}
.carousel-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* 通栏轮播的左右箭头贴在视口边缘，文字必须让开，否则会被压住 */
  padding: 48px 76px 48px;
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
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.carousel-desc {
  font-size: 16px;
  opacity: 0.95;
  margin: 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.85);
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 22px;
  color: #263746;
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

/* ---------- 快速开始 / 知识推荐 / 结束引导（交接文档 §4.3 §4.5 §4.7，手机端） ---------- */
.quick-start,
.knowledge-strip,
.home-ending { display: none; }
@media (max-width: 767px) {
  /* 分册三：精选/知识/晴天整合为一个次级探索区，不平铺成多个门户模块
     ⇒ 手机端隐藏通栏轮播，保留今日精选 + 知识推荐 */
  .carousel { display: none; }
  .quick-start,
  .knowledge-strip,
  .home-ending { display: block; }
}
.quick-start { padding: 2px 0 6px; }
.quick-start-title {
  font-size: 17px;
  font-weight: 700;
  color: #263746;
  margin: 0 0 10px;
}
.quick-start-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.qs-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  min-height: 100px;
  padding: 14px 8px;
  background: #FFFFFF;
  border: 1px solid #E6EAF0;
  border-radius: 14px;
  text-decoration: none;
  box-shadow: 0 4px 14px rgba(52, 91, 142, 0.06);
}
.qs-icon {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  background: #F0F4F9;
  border-radius: 50%;
}
.qs-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #263746;
}
.qs-desc {
  font-size: 11px;
  color: #5A6B7C;
  line-height: 1.4;
}
.knowledge-strip { margin-top: 28px; }
.ks-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.ks-title {
  font-size: 17px;
  font-weight: 700;
  color: #263746;
  margin: 0;
}
.ks-more {
  font-size: 13px;
  color: #345B8E;
  text-decoration: none;
  white-space: nowrap;
}
.ks-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
  scroll-snap-type: x mandatory;
}
.ks-card {
  flex: 0 0 46%;
  max-width: 180px;
  min-height: 84px;
  scroll-snap-align: start;
  background: #FFFFFF;
  border: 1px solid #E6EAF0;
  border-radius: 14px;
  padding: 12px;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ks-tag {
  font-size: 11px;
  color: #5A6B7C;
}
.ks-name {
  font-size: 13px;
  font-weight: 600;
  color: #263746;
  line-height: 1.45;
}
.home-ending {
  text-align: center;
  padding: 36px 16px 8px;
}
.home-ending-title {
  font-size: 16px;
  font-weight: 600;
  color: #263746;
  margin: 0 0 6px;
}
.home-ending-sub {
  font-size: 13px;
  color: #5A6B7C;
  margin: 0;
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
  color: #263746;
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
  background: #345B8E;
  border-radius: 2px;
}
.feature-subtitle {
  color: #5A6B7C;
  font-size: 14px;
  margin: 4px 0 0;
}
.feature-stats {
  font-size: 13px;
  color: #345B8E;
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
  color: #5A6B7C;
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
  color: #D87945;
  background: #fff3e0;
  padding: 2px 8px;
  border-radius: 12px;
}
.feature-card-title {
  font-size: 17px;
  font-weight: 700;
  color: #263746;
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
  color: #5A6B7C;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.feature-card-stats {
  margin-left: auto;
  color: #345B8E;
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
  color: #263746;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: color 0.2s;
}
.post-modal-close:hover {
  color: #D87945;
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
  color: #D87945;
  background: #fff3e0;
  padding: 3px 10px;
  border-radius: 12px;
}
.post-modal-author {
  font-size: 12px;
  color: #5A6B7C;
}
.post-modal-title {
  font-size: 22px;
  font-weight: 700;
  color: #263746;
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
  color: #D87945;
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
  color: #263746;
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
  color: #263746;
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
  .carousel-slide {
    height: 220px;
  }
  /* 手机上箭头竖直居中会压住底部标题，移到顶部 */
  .carousel-arrow {
    top: 12px;
    transform: none;
  }
  /* 手机上箭头竖直居中会压住底部标题，移到顶部 */
  .carousel-arrow {
    top: 12px;
    transform: none;
  }
  .carousel-arrow {
    /* 触控目标不能小于 44：原来这里缩到 34，手机上很难点中 */
    width: 44px;
    height: 44px;
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
