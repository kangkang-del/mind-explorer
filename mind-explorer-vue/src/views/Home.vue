<template>
  <section class="home-main">
    <!-- 核心转化 Hero（2026-11-13 阶段5 视觉参考定稿）：
         全宽插画背景 + 左侧叠字 + 暖橙 CTA；桌面/手机双文案由 CSS 切换 -->
    <section class="xiaomu-hero">
      <div class="hero-inner">
        <div class="hero-text">
          <!-- 桌面文案 -->
          <span class="hero-copy copy-desk">
            <h1 class="hero-title">在探索中，<br />遇见<span class="hero-hl">更好的自己</span></h1>
            <p class="hero-subtitle">这是一段关于心灵成长的旅程，<br />你并不孤单。</p>
            <div class="hero-action">
              <RouterLink to="/companion" class="hero-cta-btn" @click="playSound('tap')">
                <span class="hero-cta-ico" aria-hidden="true">⚡</span>
                <span>开始探索</span>
                <span class="hero-arrow">→</span>
              </RouterLink>
              <p class="hero-hint">免费 · 无需注册 · 随时可走</p>
            </div>
          </span>
          <!-- 手机文案 -->
          <span class="hero-copy copy-mob">
            <h1 class="hero-title">不想一个人<span class="hero-hl">扛着</span>吗？</h1>
            <p class="hero-subtitle">在这里，探索内心的世界，<br />找到属于自己的方向。</p>
            <div class="hero-action">
              <RouterLink to="/companion" class="hero-cta-btn" @click="playSound('tap')">
                <span class="hero-cta-ico" aria-hidden="true">💬</span>
                <span>陪小木聊聊</span>
                <span class="hero-arrow">→</span>
              </RouterLink>
              <p class="hero-hint">免费 · 无需注册 · 随时可走</p>
            </div>
          </span>
        </div>
      </div>
      <!-- 插画 = 用户 2026-11-12 提供的占位资产；桌面/手机同为全宽背景，
           手机取景偏右（人物+小木+路牌），由 background-position 控制 -->
    </section>

    <!-- 白色浮条：四个核心入口（阶段5 参考稿），叠压 Hero 底边；手机端用下方「从此刻开始」三卡 -->
    <nav class="hero-dock" aria-label="快速开始">
      <RouterLink
        v-for="m in heroMarkers"
        :key="m.to"
        :to="m.to"
        class="dock-item"
        @click="playSound('tap')"
      >
        <span class="dock-icon" :class="m.tone" aria-hidden="true">{{ m.icon }}</span>
        <span class="dock-body">
          <span class="dock-title">{{ m.title }}</span>
          <span class="dock-desc">{{ m.desc }}</span>
        </span>
        <span class="dock-arrow" aria-hidden="true">›</span>
      </RouterLink>
    </nav>

    <!-- 快速开始（交接文档 §4.3）：三张低门槛行动卡，手机端展示；桌面入口在 Hero 路标 -->
    <section class="quick-start" aria-label="从此刻开始">
      <h2 class="quick-start-title">从此刻开始</h2>
      <div class="quick-start-cards">
        <RouterLink to="/companion" class="qs-card" @click="playSound('tap')">
          <span class="qs-icon" aria-hidden="true">💬</span>
          <span class="qs-title">找个人聊聊</span>
          <span class="qs-desc">和小木说说现在的感受</span>
        </RouterLink>
        <RouterLink to="/tools" class="qs-card" @click="playSound('tap')">
          <span class="qs-icon" aria-hidden="true">🌿</span>
          <span class="qs-title">先缓一缓</span>
          <span class="qs-desc">使用呼吸等自助工具</span>
        </RouterLink>
        <RouterLink to="/mood" class="qs-card" @click="playSound('tap')">
          <span class="qs-icon" aria-hidden="true">📝</span>
          <span class="qs-title">记录一下</span>
          <span class="qs-desc">写下现在的心情</span>
        </RouterLink>
      </div>
    </section>

    <!-- （2026-11-13 阶段5）通栏轮播退役：首页行动优先，不做内容门户；
         治愈瞬间内容改由「心灵晴天」页承载 -->

    <!-- 今日精选：中间内容、两边空白 -->
    <section class="today-feature">
      <div class="feature-header">
        <div class="feature-title-group">
          <h2 class="feature-title"><span aria-hidden="true">🌱</span> 今日精选</h2>
          <p class="feature-subtitle">来自心灵晴天的每日推送，每天自动换新</p>
        </div>
      </div>

      <div class="feature-grid">
        <!-- 左侧主内容：文章卡片 -->
        <div class="feature-main">
          <p v-if="loading" class="feature-loading">正在加载今日精选… ☀️</p>

          <article v-for="post in featuredPosts" :key="post.id" class="feature-card" role="button" tabindex="0" @click="playSound('tap'); openModal(post)" @keydown.enter="openModal(post)">
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
        <RouterLink v-for="k in knowledgePicks" :key="k.id" to="/knowledge" class="ks-card" @click="playSound('tap')">
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
import { communityApi } from '../api/community'
import { useAuthStore } from '../stores/auth'
import { play as playSound } from '../audio/soundManager'
import FavoriteButton from '../components/FavoriteButton.vue'

const auth = useAuthStore()
const activePost = ref(null)
const posts = ref([])
const loading = ref(true)

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

// 心理知识推荐（交接文档 §4.5）：取自现有知识库前 8 条，横向滑动露出下一张
const knowledgePicks = cardsRaw.slice(0, 8)

// 白色浮条：桌面首屏的四个入口（2026-11-13 阶段5 视觉参考稿文案）
const heroMarkers = [
  { to: '/companion', icon: '💬', tone: 'tone-blue', title: '与同行者聊天', desc: '分享心事，获得支持' },
  { to: '/knowledge', icon: '📚', tone: 'tone-sky', title: '探索知识库', desc: '学习心理健康知识' },
  { to: '/mood', icon: '💛', tone: 'tone-warm', title: '记录心情日记', desc: '留下此刻的心情' },
  { to: '/tools', icon: '🧰', tone: 'tone-slate', title: '使用自助工具', desc: '练习情绪管理' },
]

// 今日精选（0012：从「心灵晴天」每日推送里按日种子选 3 条，每天自动换新）
const featuredPosts = computed(() => {
  const pushPosts = posts.value.filter((p) => p.isAutoPush || p.type === 'auto' || p.type === 'xiaomu')
  const picked = dailyPick(pushPosts, 3)
  return picked.length ? picked : posts.value.slice(0, 3)
})

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
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<style scoped>
.home-main {
  width: 100%;
}

/* ---------- Hero（2026-11-13 阶段5 视觉参考定稿）：全宽插画 + 左侧叠字 + 暖橙 CTA ----------
   全宽破栏手法与原 carousel 相同：left 50% + translateX(-50%) + 100vw，不破坏 App 容器留白模型 */
.xiaomu-hero {
  position: relative;
  left: 50%;
  transform: translateX(-50%);
  width: 100vw;
  margin: 0 0 0;
  padding: 88px 0 132px;
  background-color: #EAF1F8;
  /* 左侧暖白渐变保证深蓝文字对比度 ≥4.5:1，插画主体（人物/路牌/日出）在右半透出 */
  background-image:
    linear-gradient(90deg, rgba(253, 251, 246, 0.92) 0%, rgba(253, 251, 246, 0.72) 26%, rgba(253, 251, 246, 0.28) 52%, rgba(253, 251, 246, 0) 74%),
    url('../assets/hero-atlas.jpg');
  background-size: cover, cover;
  background-position: center, 78% 30%;
  background-repeat: no-repeat;
  overflow: hidden;
  color: #263746;
}
.hero-inner {
  max-width: 1136px;
  margin: 0 auto;
  padding: 0 clamp(16px, 2.5vw, 32px);
}
.hero-copy { display: block; }
.copy-mob { display: none; }
.hero-title {
  font-size: 44px;
  font-weight: 700;
  margin: 0 0 18px;
  line-height: 1.28;
  letter-spacing: 1px;
  color: #263746;
  max-width: 640px;
}
/* 手绘感下划线（阶段5 参考稿）：SVG 波浪线垫在文字底部 */
.hero-hl {
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 12' preserveAspectRatio='none'%3E%3Cpath d='M2 9 Q 40 3 80 7 T 160 6 T 198 8' fill='none' stroke='%23EE8B3E' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat left 100% / 100% 10px;
  padding-bottom: 8px;
}
.hero-subtitle {
  font-size: 16px;
  margin: 0;
  line-height: 1.75;
  max-width: 480px;
  color: #45566B;
  letter-spacing: 0.04em;
}
.hero-action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 26px;
}
/* 暖橙 CTA（brand.accent，2026-11-13 参考稿定稿；与紧急色 #D87945 语义区分：
   accent 只用于首页主 CTA/温暖行动，urgent 只用于危机与紧急求助） */
.hero-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #EE8B3E;
  color: #fff;
  padding: 15px 32px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
  box-shadow: 0 8px 24px rgba(238, 139, 62, 0.35);
}
.hero-cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(238, 139, 62, 0.45);
  background: #E07D2C;
}
.hero-cta-ico {
  font-size: 17px;
  line-height: 1;
}
.hero-arrow {
  font-size: 20px;
  transition: transform 0.25s ease;
}
.hero-cta-btn:hover .hero-arrow {
  transform: translateX(4px);
}
.hero-hint {
  font-size: 13px;
  color: #45566B;
  margin: 0;
}

/* 白色浮条：四个核心入口，叠压 Hero 底边（阶段5 参考稿） */
.hero-dock {
  position: relative;
  z-index: 3;
  max-width: 1136px;
  margin: -72px auto 34px;
  padding: 0 clamp(16px, 2.5vw, 32px);
}
.dock-item {  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 22px;
  background: #FFFFFF;
  border-radius: 20px;
  box-shadow: 0 12px 32px rgba(52, 91, 142, 0.12);
  text-decoration: none;
  color: #263746;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.dock-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 40px rgba(52, 91, 142, 0.18);
}
.dock-item + .dock-item {
  border-left: 1px solid #E6EAF0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.hero-dock {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
.dock-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  border-radius: 50%;
  flex: none;
}
.tone-blue { background: #EAF2FB; }
.tone-sky  { background: #E6F1F5; }
.tone-warm { background: #FDEFE2; }
.tone-slate { background: #EDF1F6; }
.dock-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.dock-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: #263746;
}
.dock-desc {
  font-size: 13px;
  line-height: 1.4;
  color: #5A6B7C;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dock-arrow {
  margin-left: auto;
  font-size: 20px;
  color: #9AA6B2;
  flex: none;
  transition: transform 0.2s ease, color 0.2s ease;
}
.dock-item:hover .dock-arrow {
  color: #EE8B3E;
  transform: translateX(3px);
}
/* 平板（768–1023）：浮条折 2×2 */
@media (max-width: 1023px) {
  .hero-dock {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .dock-item + .dock-item {
    border-left: 0;
    border-radius: 20px;
  }
}

/* 手机（<768）：全宽插画叠字（取景偏右对准人物/小木/路牌），浮条隐藏 */
@media (max-width: 767px) {
  .xiaomu-hero {
    padding: 128px 0 96px;
    background-image:
      linear-gradient(180deg, rgba(253, 251, 246, 0.94) 0%, rgba(253, 251, 246, 0.72) 30%, rgba(253, 251, 246, 0.24) 58%, rgba(253, 251, 246, 0) 80%),
      url('../assets/hero-atlas.jpg');
    background-position: center, 62% 52%;
  }
  .copy-desk { display: none; }
  .copy-mob { display: block; }
  .hero-title {
    font-size: 27px;
    letter-spacing: 0.5px;
  }
  .hero-subtitle { font-size: 15px; }
  .hero-action { margin-top: 18px; }
  .hero-cta-btn {
    padding: 12px 24px;
    font-size: 15px;
  }
  .hero-dock { display: none; }
}

/* ---------- 快速开始 / 知识推荐 / 结束引导（交接文档 §4.3 §4.5 §4.7，手机端） ---------- */
/* 手机端内容收敛（阶段5 参考稿）：Hero → 从此刻开始 → 今日精选（一大两小）→ 公告条 → 结束引导；
   通栏轮播已删除，知识推荐不再在手机端平铺 */
.quick-start,
.knowledge-strip,
.home-ending { display: none; }
@media (max-width: 767px) {
  .quick-start,
  .home-ending { display: block; }
}
/* 「从此刻开始」= 参考稿里叠压 Hero 底边的白色大圆角卡 */
.quick-start {
  position: relative;
  z-index: 3;
  margin: -64px 0 8px;
  padding: 20px 16px 18px;
  background: #FFFFFF;
  border-radius: 24px;
  box-shadow: 0 12px 32px rgba(52, 91, 142, 0.12);
}
.quick-start-title {
  font-size: 17px;
  font-weight: 700;
  color: #263746;
  margin: 0 0 14px;
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
  gap: 8px;
  min-height: 120px;
  padding: 14px 8px;
  background: #F7F9FC;
  border: 1px solid #E6EAF0;
  border-radius: 16px;
  text-decoration: none;
  color: #263746;
}
.qs-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  background: #EAF2FB;
  border-radius: 50%;
}
.qs-card:nth-child(2) .qs-icon { background: #E8F3EC; }
.qs-card:nth-child(3) .qs-icon { background: #EFEBFA; }
.qs-title {
  font-size: 15px;
  font-weight: 700;
  color: #263746;
}
.qs-desc {
  font-size: 15px;
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
  color: #263746;
}
.ks-tag {
  font-size: 12px;
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
.feature-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}
.feature-main {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
  grid-column: 1 / -1;
}
.feature-card {
  display: flex;
  flex-direction: column;
  padding: 12px;
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
  width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 12px;
  flex-shrink: 0;
}
.feature-card-body {
  flex: 1;
  min-width: 0;
  padding: 12px 4px 4px;
}
.feature-card-tag {
  display: inline-block;
  font-size: 12px;
  color: #B4531F;
  background: #FDEFE2;
  padding: 2px 10px;
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

/* 平板及以下（<=1024px）：精选网格折叠为单列，公告信息落到内容下方 */
@media (max-width: 1024px) {
  .feature-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .feature-sidebar {
    position: static;
  }
  .feature-main {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* 手机（<=768px）：精选一大两小 + 公告横条（阶段5 参考稿） */
@media (max-width: 768px) {
  .feature-header {
    align-items: flex-start;
  }
  .feature-main {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  /* 首卡全宽（图上文下），其余两张半宽 */
  .feature-card:first-of-type {
    grid-column: 1 / -1;
  }
  .feature-card:first-of-type .feature-card-img {
    height: 170px;
  }
  .feature-card:not(:first-of-type) .feature-card-img {
    height: 92px;
  }
  .feature-card-meta {
    display: none;
  }
  /* 公告收成单行横条：喇叭标题 + 第一条内容 + 箭头感 */
  .notice-box {
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .notice-title {
    margin: 0;
    font-size: 14px;
    white-space: nowrap;
    text-align: left;
  }
  .notice-list {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  .notice-list li {
    padding: 0;
    border-bottom: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .notice-list li:not(:first-child) {
    display: none;
  }
  .notice-list li strong {
    font-weight: 600;
  }
}

/* 超小屏（<=480px） */
@media (max-width: 480px) {
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
