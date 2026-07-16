<template>
  <main>
    <header class="text-center mb-5">
      <h1 class="text-2xl md:text-3xl font-bold text-[#3a4a5c] m-0">☀️ 心灵晴天</h1>
      <p class="text-[#9aa6b2] mt-1 m-0">猫狗 · 善意行为 · 美好环境，推送温暖时刻。</p>
    </header>

    <!-- 分类 Tab -->
    <nav class="flex gap-2 justify-center mb-5 flex-wrap">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="active = tab.key"
        class="px-4 py-1.5 rounded-[20px] text-[14px] border transition"
        :class="active === tab.key ? 'bg-[#fff3e0] text-[#e07a3f] border-[#f0a868] font-semibold' : 'bg-white text-[#5a6b7c] border-[#eef2f7] hover:border-[#f5d2b0]'"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- 加载态 -->
    <p v-if="loading" class="text-center text-[#9aa6b2] py-12 m-0">正在加载晴天的温暖… ☀️</p>

    <!-- 发帖 -->
    <section v-else class="bg-white border border-[#eef2f7] rounded-2xl p-4 mb-5">
      <textarea
        v-model="draft.content"
        rows="3"
        placeholder="分享一个温暖瞬间，或此刻的心情…"
        class="w-full p-3 border border-[#e0e6ec] rounded-lg resize-y text-[14px] focus:outline-none focus:border-[#7c9cb8]"
      ></textarea>
      <div class="flex items-center justify-between mt-3 flex-wrap gap-3">
        <div class="flex gap-3 flex-wrap">
          <label v-for="c in categories" :key="c.key" class="text-[13px] text-[#5a6b7c]">
            <input type="radio" v-model="draft.category" :value="c.key" class="accent-[#7c9cb8]" /> {{ c.label }}
          </label>
        </div>
        <button
          @click="publish"
          :disabled="!draft.content.trim() || publishing"
          class="px-5 py-2 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-lg text-[14px] disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-90"
        >
          {{ publishing ? '发布中…' : '发布' }}
        </button>
      </div>
    </section>

    <!-- 内容流：手机1列 / 平板2列 / 桌面3列 -->
    <section v-if="!loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <article
        v-for="post in visiblePosts"
        :key="post.id"
        class="bg-white border border-[#eef2f7] rounded-2xl overflow-hidden flex flex-col"
      >
        <img v-if="post.image" :src="post.image" :alt="post.title" class="w-full h-44 object-cover" loading="lazy" />
        <div class="p-4 flex-1 flex flex-col">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span v-if="post.type === 'auto'" class="text-[11px] text-[#e07a3f] bg-[#fff3e0] px-2 py-0.5 rounded-md">✨ 今日晴天</span>
            <span v-else-if="post.type === 'xiaomu'" class="text-[11px] text-[#5a8a6a] bg-[#e6efe9] px-2 py-0.5 rounded-md">🌿 小木语录</span>
            <span class="text-[11px] text-[#7c9cb8] bg-[#eef4f9] px-2 py-0.5 rounded-md">{{ catLabel(post.category) }}</span>
          </div>
          <h3 class="text-[16px] font-bold text-[#3a4a5c] m-0 leading-snug">{{ post.title }}</h3>
          <p class="text-[13px] text-[#5a6b7c] mt-1 flex-1 leading-relaxed m-0">{{ post.content }}</p>

          <div class="flex items-center gap-4 mt-3 text-[13px] text-[#9aa6b2]">
            <button @click="toggleLike(post)" :class="post.liked ? 'text-[#e07a3f]' : ''" class="transition">❤️ {{ post.likes }}</button>
            <button @click="post.showComment = !post.showComment" class="transition">💬 {{ post.comments.length }}</button>
          </div>

          <div v-if="post.showComment" class="mt-3 border-t border-[#eef2f7] pt-3">
            <div v-for="c in post.comments" :key="c.id" class="text-[12px] text-[#5a6b7c] mb-1">
              <b>{{ c.author }}</b>：{{ c.text }}
            </div>
            <div class="flex gap-2 mt-2">
              <input
                v-model="post.draftComment"
                placeholder="说点温暖的话…"
                class="flex-1 px-2 py-1 border border-[#e0e6ec] rounded text-[13px] focus:outline-none focus:border-[#7c9cb8]"
              />
              <button @click="addComment(post)" class="px-3 py-1 bg-[#7c9cb8] text-white rounded text-[13px] shrink-0">发送</button>
            </div>
          </div>
        </div>
      </article>
    </section>

    <p v-if="!loading && !visiblePosts.length" class="text-center text-[#9aa6b2] py-12 m-0">这个分类下还没有内容，换个标签看看 ☀️</p>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { communityApi } from '../api/community'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const categories = [
  { key: 'cat', label: '🐱 猫狗' },
  { key: 'kindness', label: '🤝 善意' },
  { key: 'nature', label: '🌅 环境' },
]
const tabs = [
  { key: 'all', label: '🌿 全部' },
  { key: 'cat', label: '🐱 猫狗' },
  { key: 'kindness', label: '🤝 善意' },
  { key: 'nature', label: '🌅 环境' },
]
const active = ref('all')

function catLabel(k) {
  const map = { cat: '猫狗', dog: '猫狗', kindness: '善意', nature: '环境', quote: '小木语录', general: '其他' }
  return map[k] || k
}

const loading = ref(true)
const publishing = ref(false)
const posts = ref([])
const myLikes = ref({}) // postId -> 是否已认同

const visiblePosts = computed(() => {
  return active.value === 'all'
    ? posts.value
    : posts.value.filter((p) => p.category === active.value)
})

const draft = ref({ content: '', category: 'cat' })

// 将 Supabase 记录映射为页面需要的结构
function normalize(raw) {
  return {
    id: raw.id,
    type: raw.type || 'user',
    category: raw.category || 'general',
    title: raw.title,
    content: raw.content,
    image: raw.image || '',
    author: raw.username || '匿名用户',
    createdAt: raw.created_at,
    isAutoPush: !!raw.is_auto_push,
    likes: 0,
    liked: false,
    comments: [],
    showComment: false,
    draftComment: '',
  }
}

async function loadPosts() {
  loading.value = true
  try {
    const raw = await communityApi.getPosts()
    let list = raw.map(normalize)

    // 批量拉取点赞数
    try {
      const ids = list.map((p) => p.id)
      const likeMap = await communityApi.getLikesBatch(ids)
      list.forEach((p) => (p.likes = likeMap[p.id] || 0))
    } catch (e) {
      console.warn('获取点赞数失败', e)
    }

    // 当前用户已认同状态
    const me = auth.currentUser
    if (me) {
      const myId = me.type === 'github' ? me.username : me.id
      const { data } = await supabaseLikeList(ids)
      const likedIds = new Set((data || []).filter((r) => r.user_identifier === myId).map((r) => r.post_id))
      list.forEach((p) => (p.liked = likedIds.has(p.id)))
    }

    posts.value = list
  } catch (e) {
    console.error('加载帖子失败', e)
    posts.value = []
  } finally {
    loading.value = false
  }
}

// 取当前用户在所有帖子上的认同记录（一次查询）
async function supabaseLikeList(ids) {
  const { supabase } = await import('../api/supabase')
  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id, user_identifier')
    .in('post_id', ids)
  return { data, error }
}

// 兜底懒触发：每日首次打开若今日尚无自动推送，则即时拉取
async function ensureTodayPush() {
  const hasAuto = posts.value.some((p) => p.isAutoPush)
  if (hasAuto) return
  try {
    const res = await communityApi.triggerSunnyPush()
    if (res && res.pushed) {
      await loadPosts() // 重新读取，包含新推送
    }
  } catch (e) {
    console.warn('兜底推送未触发（可忽略，定时任务会补）', e)
  }
}

async function publish() {
  if (!draft.value.content.trim() || publishing.value) return
  publishing.value = true
  try {
    const user = auth.currentUser || { name: '我', type: 'guest' }
    const created = await communityApi.addPost({
      title: draft.value.content.slice(0, 20),
      content: draft.value.content,
      user,
      type: 'user',
      category: draft.value.category,
    })
    posts.value.unshift(normalize({ ...created, username: user.name || '我' }))
    draft.value.content = ''
  } catch (e) {
    console.error('发布失败', e)
    alert('发布失败，请稍后再试')
  } finally {
    publishing.value = false
  }
}

async function toggleLike(p) {
  const me = auth.currentUser
  if (!me) {
    alert('请先登录后再认同 ❤️')
    return
  }
  const before = p.liked
  p.liked = !p.liked
  p.likes += p.liked ? 1 : -1
  try {
    await communityApi.toggleLike(p.id, me)
  } catch (e) {
    console.error('认同操作失败', e)
    p.liked = before
    p.likes += before ? 1 : -1
  }
}

async function addComment(p) {
  const me = auth.currentUser
  if (!me) {
    alert('请先登录后再评论 💬')
    return
  }
  if (!p.draftComment.trim()) return
  try {
    const c = await communityApi.addComment(p.id, p.draftComment, me)
    p.comments.push({ id: c.id, author: c.username || me.name || '我', text: c.content })
    p.draftComment = ''
  } catch (e) {
    console.error('评论失败', e)
  }
}

onMounted(async () => {
  await loadPosts()
  await ensureTodayPush()
})
</script>
