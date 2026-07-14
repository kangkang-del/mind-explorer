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

    <!-- 发帖 -->
    <section class="bg-white border border-[#eef2f7] rounded-2xl p-4 mb-5">
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
          :disabled="!draft.content.trim()"
          class="px-5 py-2 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-lg text-[14px] disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-90"
        >
          发布
        </button>
      </div>
    </section>

    <!-- 内容流：手机1列 / 平板2列 / 桌面3列 -->
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

    <p v-if="!visiblePosts.length" class="text-center text-[#9aa6b2] py-12 m-0">这个分类下还没有内容，换个标签看看 ☀️</p>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'

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
  return categories.find(c => c.key === k)?.label?.replace(/[🐱🤝🌅]\s*/, '') || k
}

// 初始 mock 内容（模拟「自动推送」防冷场 + 小木语录穿插）
let uid = 100
const posts = ref([
  { id: 1, type: 'auto', category: 'cat', title: '今天遇到的橘猫', content: '它在台阶上晒了一下午太阳，尾巴一摆一摆，好像在说「生活很好」。', image: 'https://picsum.photos/seed/cat1/400/300', author: '系统推送', likes: 12, liked: false, comments: [], showComment: false, draftComment: '' },
  { id: 2, type: 'auto', category: 'kindness', title: '地铁上有人让座', content: '一位阿姨主动把座位让给提重物的小伙子，两人都笑了。', image: 'https://picsum.photos/seed/kind1/400/300', author: '系统推送', likes: 8, liked: false, comments: [{ id: 1, author: '路人', text: '世界好温柔' }], showComment: false, draftComment: '' },
  { id: 3, type: 'auto', category: 'nature', title: '雨后的天空', content: '云散开的时候，整片天都是橘子味的。', image: 'https://picsum.photos/seed/nature1/400/300', author: '系统推送', likes: 15, liked: false, comments: [], showComment: false, draftComment: '' },
  { id: 4, type: 'xiaomu', category: 'kindness', title: '小木的今日语录', content: '你不必时刻坚强。允许自己偶尔像猫一样，懒洋洋地、只是存在着，也很好。', author: '小木', likes: 20, liked: false, comments: [], showComment: false, draftComment: '' },
])

const visiblePosts = computed(() => {
  return active.value === 'all'
    ? posts.value
    : posts.value.filter(p => p.category === active.value)
})

const draft = ref({ content: '', category: 'cat' })

function publish() {
  if (!draft.value.content.trim()) return
  posts.value.unshift({
    id: ++uid,
    type: 'user',
    category: draft.value.category,
    title: draft.value.content.slice(0, 20),
    content: draft.value.content,
    image: '',
    author: '我',
    likes: 0,
    liked: false,
    comments: [],
    showComment: false,
    draftComment: '',
  })
  draft.value.content = ''
}

function toggleLike(p) {
  p.liked = !p.liked
  p.likes += p.liked ? 1 : -1
}

function addComment(p) {
  if (!p.draftComment.trim()) return
  p.comments.push({ id: Date.now(), author: '我', text: p.draftComment })
  p.draftComment = ''
}
</script>
