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
        <div class="mb-4">
          <el-input v-model="search" placeholder="搜索知识卡片或心理疾病…" clearable>
            <template #prefix>🔍</template>
          </el-input>
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

    <el-dialog v-model="dialogVisible" :title="detailTitle" width="92%" top="8vh">
      <div class="detail-content" v-html="detailHtml"></div>
    </el-dialog>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import cardsRaw from '../data/cards.json'
import healthRaw from '../data/health.json'

const cards = ref(cardsRaw.map(c => ({ ...c, type: 'card', key: c.id })))
const healths = ref(healthRaw.map(h => ({ ...h, type: 'health', key: h.slug })))

const activeType = ref('all')
const search = ref('')

const categories = computed(() => [
  { key: 'all', label: '全部', count: cards.value.length + healths.value.length },
  { key: 'card', label: '知识卡片', count: cards.value.length },
  { key: 'health', label: '心理疾病', count: healths.value.length },
])

const filtered = computed(() => {
  let list = activeType.value === 'all'
    ? [...cards.value, ...healths.value]
    : activeType.value === 'card' ? cards.value : healths.value
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(i => (i.title + ' ' + i.summary).toLowerCase().includes(q))
  }
  return list
})

const dialogVisible = ref(false)
const detailTitle = ref('')
const detailHtml = ref('')

function openDetail(item) {
  detailTitle.value = (item.type === 'health' ? item.icon + ' ' : '') + item.title
  if (item.type === 'card') {
    detailHtml.value = item.content || ''
  } else {
    const sec = (item.sections || []).map(s => `<h2>${s.title}</h2>${s.content}`).join('')
    const warm = item.warmNote ? `<p class="warm">${item.warmNote}</p>` : ''
    const bottom = item.bottomNote ? `<p>${item.bottomNote}</p>` : ''
    detailHtml.value = sec + warm + bottom
  }
  dialogVisible.value = true
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
</style>
