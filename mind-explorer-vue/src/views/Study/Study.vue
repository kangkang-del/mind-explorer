<template>
  <main class="container" style="padding: 40px 20px; max-width: 1200px; margin: 0 auto;">
    <h1>📖 知识学习</h1>

    <div class="tabs">
      <button :class="{active: activeTab==='official'}" @click="activeTab='official'">官方卡片 ({{ cards.length }})</button>
      <button :class="{active: activeTab==='user'}" @click="activeTab='user'">用户贡献 ({{ userCards.length }})</button>
    </div>

    <!-- 官方卡片 -->
    <div v-if="activeTab==='official'">
      <div class="filter-bar">
        <a href="/study" class="filter-tag active">全部 ({{ cards.length }})</a>
        <a href="#" class="filter-tag" v-for="cat in categories" :key="cat.name">{{ cat.name }} ({{ cat.count }})</a>
      </div>
      <div class="card-grid">
        <CardItem v-for="card in cards" :key="card.id" :card="card" />
      </div>
    </div>

    <!-- 用户贡献卡片 -->
    <div v-else>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="!userCards.length" class="empty">
        暂无用户贡献卡片。<RouterLink to="/upload">去上传第一张 →</RouterLink>
      </div>
      <div v-else class="card-grid">
        <CardItem
          v-for="uc in userCards"
          :key="uc.id"
          :card="mapUserCard(uc)"
        />
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import CardItem from '../../components/Card/CardItem.vue'
import cards from '../../data/cards.json'
import { userCardsApi } from '../../api/userCards'

const activeTab = ref('official')
const userCards = ref([])
const loading = ref(false)

const categories = computed(() => {
  const map = {}
  cards.forEach(c => { map[c.category] = (map[c.category] || 0) + 1 })
  return Object.entries(map).map(([name, count]) => ({ name, count }))
})

// 把 user_cards 映射成 CardItem 兼容结构
function mapUserCard(uc) {
  return {
    id: uc.id,                    // UUID
    category: uc.category,
    title: uc.title,
    proponent: uc.author_name,    // 作者显示为"提出者"
    summary: uc.summary || uc.content.slice(0, 80) + '...',
    isUserCard: true              // 标记，用于跳转 user-card 详情
  }
}

async function loadUserCards() {
  loading.value = true
  try {
    userCards.value = await userCardsApi.getApproved(100)
  } catch (e) {
    userCards.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadUserCards()
})
</script>

<style scoped>
.tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.tabs button { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; font-size: 14px; }
.tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.filter-tag { padding: 6px 14px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 20px; text-decoration: none; color: var(--text-light); font-size: 0.9rem; }
.filter-tag.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.loading, .empty { text-align: center; padding: 60px; color: var(--text-light); }
</style>
