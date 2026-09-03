<template>
  <main class="max-w-6xl mx-auto">
    <header class="mb-5">
      <h1 class="text-2xl md:text-3xl font-bold text-[#3a4a5c] m-0">📚 了解心理学知识</h1>
      <p class="text-[#9aa6b2] mt-1 m-0">知识卡片 · 心理疾病科普 —— 用科学理解心灵。</p>
    </header>

    <div class="flex flex-col md:flex-row gap-5">
      <!-- 左侧分类（桌面） -->
      <aside class="hidden md:block w-48 shrink-0">
        <div class="flex flex-col gap-1 sticky top-[76px]">
          <button
            v-for="cat in categories"
            :key="cat.key"
            @click="activeType = cat.key"
            class="text-left px-3 py-2 rounded-lg text-[14px] transition"
            :class="activeType === cat.key ? 'bg-[#eef4f9] text-[#7c9cb8] font-semibold' : 'text-[#5a6b7c] hover:bg-[#f0f4f9]'"
          >
            {{ cat.label }} <span class="text-[#b8b8b8]">{{ cat.count }}</span>
          </button>
        </div>
      </aside>

      <!-- 右侧主体 -->
      <div class="flex-1 min-w-0">
        <!-- 手机分类 -->
        <div class="md:hidden flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            v-for="cat in categories"
            :key="cat.key"
            @click="activeType = cat.key"
            class="shrink-0 px-3 py-1.5 rounded-[20px] text-[13px] border transition"
            :class="activeType === cat.key ? 'bg-[#eef4f9] text-[#7c9cb8] border-[#c5d8ea] font-semibold' : 'bg-white text-[#5a6b7c] border-[#eef2f7]'"
          >
            {{ cat.label }}
          </button>
        </div>

        <!-- 搜索 -->
        <div class="mb-4 relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#b8c2cc] pointer-events-none">🔍</span>
          <input
            v-model="search"
            placeholder="搜索知识卡片或心理疾病…"
            class="w-full pl-9 pr-9 py-2.5 rounded-xl border border-[#e2e8f0] bg-white text-sm text-[#3a4a5c] outline-none transition focus:border-[#7c9cb8] focus:ring-2 focus:ring-[#7c9cb8]/20 placeholder:text-[#b8c2cc]"
          />
          <button
            v-if="search"
            @click="search = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-[#b8c2cc] hover:text-[#5a6b7c] text-sm leading-none"
            aria-label="清空"
          >✕</button>
        </div>

        <!-- 卡片网格：手机1列 / 平板2列 / 桌面3列 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <article
            v-for="item in filtered"
            :key="item.type + '-' + item.key"
            @click="openDetail(item)"
            class="bg-white border border-[#eef2f7] rounded-2xl p-4 cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)] hover:border-[#c5d8ea]"
          >
            <div v-if="item.type === 'health'" class="text-2xl mb-1.5">{{ item.icon }}</div>
            <h3 class="text-[16px] font-bold text-[#3a4a5c] m-0 leading-snug">{{ item.title }}</h3>
            <span class="inline-block mt-1 text-[12px] text-[#7c9cb8] bg-[#eef4f9] px-2 py-0.5 rounded-md">{{ item.category }}</span>
            <p class="text-[13px] text-[#9aa6b2] line-clamp-3 mt-2 m-0 leading-relaxed">{{ item.summary }}</p>
            <div v-if="item.type === 'card' && item.proponent" class="text-[12px] text-[#b8b8b8] mt-2">🧑‍🔬 {{ item.proponent }}</div>
          </article>
        </div>

        <p v-if="!filtered.length" class="text-center text-[#9aa6b2] py-12 m-0">没有找到相关内容，换个关键词试试。</p>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="dialogVisible" class="fixed inset-0 z-50 flex justify-center" @click.self="dialogVisible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-[92%] max-w-2xl mt-[8vh] max-h-[82vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-4 border-b border-[#eef2f7] shrink-0">
            <h3 class="text-lg font-bold text-[#3a4a5c] m-0">{{ detailTitle }}</h3>
            <button @click="dialogVisible = false" class="text-[#9aa6b2] hover:text-[#3a4a5c] text-xl leading-none" aria-label="关闭">✕</button>
          </div>
          <div class="px-5 py-4 overflow-y-auto">
            <div class="detail-content" v-html="detailHtml"></div>

            <!-- 延伸学习：B站 / 知乎 / 维基百科 动态搜索 -->
            <div v-if="detailItem" class="study-links-box">
              <h4>🔎 延伸学习</h4>
              <p class="study-links-tip">去视频与百科平台，看别人怎么讲「{{ searchKeyword }}」：</p>
              <div class="study-links">
                <a v-for="l in studyLinks" :key="l.name" :href="l.url" target="_blank" rel="noopener" class="study-link">
                  <span>{{ l.icon }}</span> {{ l.name }}
                </a>
              </div>
            </div>

            <!-- 同感 + 评论（仅知识卡片） -->
            <div v-if="detailType === 'card'" class="card-interact-section">
              <div class="like-area">
                <button @click="toggleLike" class="like-btn" :class="{ liked: isLiked }" :disabled="liking">
                  🤝 同感 {{ likeCount }} <span v-if="!auth.isLoggedIn" class="like-hint">（点一下，登录后同感）</span>
                </button>
              </div>

              <h4 class="comments-title">评论 ({{ comments.length }})</h4>
              <div v-if="auth.isLoggedIn" class="comment-form">
                <textarea v-model="newComment" rows="2" placeholder="写下你的想法..." class="comment-input"></textarea>
                <button @click="submitComment" :disabled="submitting" class="comment-submit">{{ submitting ? '发表中…' : '发表评论' }}</button>
              </div>
              <div v-else class="login-options">
                <button @click="auth.openLogin('register')" class="guest-btn">游客注册 / 登录</button>
                <span class="divider">或</span>
                <button @click="auth.login()" class="github-btn">GitHub 登录</button>
              </div>

              <div v-if="comments.length" class="comment-list">
                <div v-for="comment in comments" :key="comment.id" class="comment-item">
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
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { cardApi } from '../api/card'
import cardsRaw from '../data/cards.json'
import healthRaw from '../data/health.json'

const auth = useAuthStore()
const cards = ref(cardsRaw.map(c => ({ ...c, type: 'card', key: c.id })))
const healths = ref(healthRaw.map(h => ({ ...h, type: 'health', key: h.slug })))

const activeType = ref('all')
const search = ref('')

// 0012：知识卡片按细分主题分类（参考旧版 16 类），心理疾病单列
const categoryCounts = computed(() => {
  const map = {}
  for (const c of cards.value) map[c.category] = (map[c.category] || 0) + 1
  return map
})
const categories = computed(() => [
  { key: 'all', label: '全部', count: cards.value.length + healths.value.length },
  ...Object.keys(categoryCounts.value)
    .sort((a, b) => categoryCounts.value[b] - categoryCounts.value[a])
    .map((k) => ({ key: k, label: k, count: categoryCounts.value[k] })),
  { key: 'health', label: '心理疾病', count: healths.value.length },
])

const filtered = computed(() => {
  let list
  if (activeType.value === 'all') list = [...cards.value, ...healths.value]
  else if (activeType.value === 'health') list = healths.value
  else list = cards.value.filter((c) => c.category === activeType.value)
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(i => (i.title + ' ' + (i.category || '') + ' ' + i.summary).toLowerCase().includes(q))
  }
  return list
})

const dialogVisible = ref(false)
const detailTitle = ref('')
const detailHtml = ref('')
const detailItem = ref(null)
const detailType = ref('card')

// —— 同感 / 评论 ——
const comments = ref([])
const newComment = ref('')
const submitting = ref(false)
const likeCount = ref(0)
const isLiked = ref(false)
const liking = ref(false)

function openDetail(item) {
  detailItem.value = item
  detailType.value = item.type
  detailTitle.value = (item.type === 'health' ? item.icon + ' ' : '') + item.title
  if (item.type === 'card') {
    detailHtml.value = item.content || ''
    loadLikes(item.id)
    loadComments(item.id)
  } else {
    // 跳过内容为空的 section（如 health.json 里占位的「相关视频」）
    const sec = (item.sections || [])
      .filter(s => (s.content || '').trim())
      .map(s => `<h2>${s.title}</h2>${s.content}`).join('')
    const warm = item.warmNote ? `<p class="warm">${item.warmNote}</p>` : ''
    const bottom = item.bottomNote ? `<p>${item.bottomNote}</p>` : ''
    detailHtml.value = sec + warm + bottom
  }
  dialogVisible.value = true
}

// —— 延伸学习：从标题提取中文主词，生成平台搜索链接 ——
const searchKeyword = computed(() => {
  const raw = (detailItem.value?.title || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim()
  return raw || detailItem.value?.title || '心理学'
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

async function loadLikes(id) {
  try {
    const likes = await cardApi.getLikes(id)
    likeCount.value = likes.length
    if (auth.isLoggedIn) {
      const user = auth.currentUser
      const identifier = user.type === 'github' ? user.username : user.id
      isLiked.value = likes.some(l => l.user_identifier === identifier)
    }
  } catch (e) {
    console.log('同感加载失败', e)
    likeCount.value = 0
  }
}

async function toggleLike() {
  if (!auth.isLoggedIn) {
    auth.openLogin('register')
    return
  }
  if (liking.value) return
  liking.value = true
  try {
    const user = auth.currentUser
    const result = await cardApi.toggleLike(detailItem.value.id, user)
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
    await cardApi.addComment(detailItem.value.id, newComment.value, auth.currentUser)
    await loadComments(detailItem.value.id)
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
.detail-content :deep(h2) { font-size: 18px; font-weight: 700; color: #3a4a5c; margin: 16px 0 8px; }
.detail-content :deep(p) { color: #5a6b7c; line-height: 1.8; margin: 8px 0; }
.detail-content :deep(ol),
.detail-content :deep(ul) { padding-left: 20px; color: #5a6b7c; line-height: 1.8; }
.detail-content :deep(li) { margin: 4px 0; }
.detail-content :deep(strong) { color: #3a4a5c; }
.detail-content :deep(.warm) {
  background: #fff3e0; color: #e07a3f; padding: 10px 14px;
  border-radius: 10px; display: block; margin-top: 14px; line-height: 1.7;
}
.study-links-box { margin: 22px 0 8px; padding: 16px 18px; background: #f6f9fc; border: 1px solid #eef2f7; border-radius: 12px; }
.study-links-box h4 { margin: 0 0 6px; color: #3a4a5c; font-size: 15px; }
.study-links-tip { margin: 0 0 12px; color: #9aa6b2; font-size: 12px; }
.study-links { display: flex; gap: 8px; flex-wrap: wrap; }
.study-link {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 8px 14px; border-radius: 18px; background: #fff;
  border: 1.5px solid #e2e8f0; color: #4a6a8a; font-size: 13px;
  text-decoration: none; transition: all 0.2s;
}
.study-link:hover { border-color: #7c9cb8; background: #eef4fa; }
.card-interact-section { margin-top: 22px; padding-top: 18px; border-top: 1px solid #eef2f7; }
.like-area { margin-bottom: 14px; }
.like-btn {
  padding: 8px 20px; border: 2px solid #ddd; border-radius: 20px;
  background: #fff; font-size: 0.95rem; cursor: pointer; transition: all 0.2s;
}
.like-btn:hover:not(:disabled) { border-color: #7c9cb8; color: #4a6a8a; }
.like-btn.liked { background: #7c9cb8; color: #fff; border-color: #7c9cb8; }
.like-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.like-hint { font-size: 0.78rem; font-weight: normal; }
.comments-title { margin: 0 0 10px; color: #3a4a5c; font-size: 15px; }
.comment-form { margin-bottom: 12px; }
.comment-input {
  width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;
  font-size: 13px; color: #3a4a5c; outline: none; resize: vertical;
  min-height: 56px; box-sizing: border-box; font-family: inherit;
}
.comment-input:focus { border-color: #7c9cb8; }
.comment-submit {
  margin-top: 8px; padding: 8px 18px; border: none; border-radius: 10px;
  background: #7c9cb8; color: #fff; font-size: 13px; cursor: pointer;
}
.comment-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.login-options { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; color: #5a6b7c; font-size: 13px; }
.guest-btn {
  padding: 8px 16px; border: none; border-radius: 10px;
  background: #7c9cb8; color: #fff; font-size: 13px; cursor: pointer;
}
.github-btn {
  padding: 8px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px;
  background: #fff; color: #5a6b7c; font-size: 13px; cursor: pointer;
}
.divider { color: #9aa6b2; font-size: 12px; }
.comment-list { margin-top: 8px; }
.comment-item { padding: 10px 0; border-bottom: 1px solid #f0f4f9; }
.comment-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.comment-header small { color: #aaa; margin-left: auto; font-size: 12px; }
.comment-body p { margin: 0; color: #5a6b7c; font-size: 13px; line-height: 1.7; }
.guest-badge { background: #f0f0f0; color: #888; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.github-badge { background: #e8f4fc; color: #0366d6; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.no-comments { color: #b8c2cc; font-size: 13px; padding: 8px 0; }
</style>
