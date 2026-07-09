<template>
  <main class="container study-page">
    <h1 class="page-title">📖 知识学习</h1>

    <!-- Tab 切换 -->
    <div class="tabs">
      <button :class="{active: activeTab==='official'}" @click="switchTab('official')">
        官方卡片 ({{ cards.length }})
      </button>
      <button :class="{active: activeTab==='user'}" @click="switchTab('user')">
        用户贡献 ({{ userCards.length }})
      </button>
    </div>

    <!-- ============ 官方卡片 ============ -->
    <div v-if="activeTab==='official'">
      <!-- 分类过滤标签（可点击筛选） -->
      <div class="filter-bar">
        <button
          class="filter-tag"
          :class="{active: !selectedCategory}"
          @click="selectedCategory = ''"
        >
          全部 ({{ cards.length }})
        </button>
        <button
          class="filter-tag"
          v-for="cat in categories"
          :key="cat.name"
          :class="{active: selectedCategory === cat.name}"
          @click="selectCategory(cat.name)"
        >
          {{ cat.name }} ({{ cat.count }})
        </button>
      </div>

      <!-- 已选分类提示 -->
      <div v-if="selectedCategory" class="filter-hint">
        当前筛选：<strong>{{ selectedCategory }}</strong>
        （共 {{ filteredCards.length }} 张）
        <button class="clear-btn" @click="selectedCategory = ''">✕ 清除</button>
      </div>

      <!-- 卡片网格 -->
      <div v-if="filteredCards.length" class="card-grid">
        <div
          class="card-wrap"
          v-for="(card, i) in filteredCards"
          :key="card.id"
          :style="{ '--i': i }"
        >
          <CardItem :card="card" />
        </div>
      </div>

      <!-- 无结果提示 -->
      <p v-else class="empty-tip">
        该分类下暂无卡片，试试其他分类 🌿
      </p>
    </div>

    <!-- ============ 用户贡献卡片 ============ -->
    <div v-else>
      <div v-if="loading" class="loading-state">
        <span class="spinner"></span> 加载中...
      </div>
      <div v-else-if="!userCards.length" class="empty-state">
        <p>暂无用户贡献卡片。</p>
        <RouterLink to="/upload" class="upload-link">去上传第一张 →</RouterLink>
      </div>
      <div v-else class="card-grid">
        <div
          class="card-wrap"
          v-for="(uc, i) in userCards"
          :key="uc.id"
          :style="{ '--i': i }"
        >
          <CardItem :card="mapUserCard(uc)" />
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import CardItem from '../../components/Card/CardItem.vue'
import cards from '../../data/cards.json'
import { userCardsApi } from '../../api/userCards'

/* ====== 状态 ====== */
const activeTab = ref('official')
const selectedCategory = ref('')  // 当前选中的分类
const userCards = ref([])
const loading = ref(false)

/* ====== 分类统计（带排序） ====== */
const categories = computed(() => {
  const map = {}
  cards.forEach(c => { map[c.category] = (map[c.category] || 0) + 1 })
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)  // 按数量降序
})

/* ====== 过滤后的卡片列表 ====== */
const filteredCards = computed(() => {
  if (!selectedCategory.value) return cards
  return cards.filter(c => c.category === selectedCategory.value)
})

/* ====== 操作方法 ====== */
function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'official') selectedCategory.value = ''
}

function selectCategory(name) {
  selectedCategory.value = selectedCategory.value === name ? '' : name  // 再次点击取消选中
}

// 把 user_cards 映射成 CardItem 兼容结构
function mapUserCard(uc) {
  return {
    id: uc.id,
    category: uc.category,
    title: uc.title,
    proponent: uc.author_name || '匿名用户',
    summary: uc.summary || (uc.content ? uc.content.slice(0, 80) + '...' : '暂无摘要'),
    isUserCard: true
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
/* ====== 页面容器 ====== */
.study-page {
  padding: 40px 20px;
  max-width: 1200px;
  margin: 0 auto;
  min-height: calc(100vh - 200px);
}
.page-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 24px;
}

/* ====== Tab 切换 ====== */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 28px;
}
.tabs button {
  padding: 10px 20px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: var(--card-bg);
  color: var(--text-light);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.22s ease;
}
.tabs button:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.tabs button.active {
  background: linear-gradient(135deg, #7eb8a5, #5fa392);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(126, 184, 165, 0.3);
}

/* ====== 分类过滤标签栏 ====== */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.filter-tag {
  padding: 7px 16px;
  background: #f5f5f5;
  border: 1.5px solid transparent;
  border-radius: 20px;
  color: var(--text-light);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}
.filter-tag:hover {
  background: rgba(126, 184, 165, 0.12);
  color: var(--primary-dark, #4a8f7c);
  border-color: rgba(126, 184, 165, 0.3);
  transform: translateY(-1px);
}
.filter-tag.active {
  background: linear-gradient(135deg, #7eb8a5, #5fa392);
  color: #fff;
  box-shadow: 0 3px 10px rgba(126, 184, 165, 0.25);
  border-color: transparent;
}

/* ====== 筛选提示 ====== */
.filter-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(126, 184, 165, 0.08), rgba(95, 163, 146, 0.08));
  border-radius: 10px;
  font-size: 0.9rem;
  color: var(--text);
}
.clear-btn {
  padding: 3px 10px;
  border: none;
  background: rgba(220, 80, 80, 0.1);
  color: #d64545;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  transition: background 0.2s;
}
.clear-btn:hover {
  background: rgba(220, 80, 80, 0.2);
}

/* ====== 卡片网格 ====== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
.card-wrap {
  animation: fadeUp 0.45s calc(var(--i, 0) * 50ms) ease both;
  transition: transform 0.25s, box-shadow 0.25s;
}
.card-wrap:hover {
  transform: translateY(-6px);
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ====== 空状态 / 加载状态 ====== */
.empty-tip {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-light);
  font-size: 1.05rem;
}
.loading-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-light);
  font-size: 1rem;
}
.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(126, 184, 165, 0.2);
  border-top-color: #7eb8a5;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
  margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  text-align: center;
  padding: 70px 20px;
  color: var(--text-light);
}
.empty-state p {
  font-size: 1.05rem;
  margin-bottom: 16px;
}
.upload-link {
  display: inline-block;
  padding: 10px 24px;
  background: linear-gradient(135deg, #7eb8a5, #5fa392);
  color: #fff;
  text-decoration: none;
  border-radius: 25px;
  font-weight: 700;
  font-size: 0.95rem;
  box-shadow: 0 4px 14px rgba(126, 184, 165, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}
.upload-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(126, 184, 165, 0.4);
}

/* ====== 响应式 ====== */
@media (max-width: 768px) {
  .study-page { padding: 28px 14px; }
  .page-title { font-size: 1.5rem; }
  .tabs button { padding: 8px 14px; font-size: 13px; }
  .filter-bar { padding: 12px; gap: 7px; }
  .filter-tag { padding: 5px 12px; font-size: 0.82rem; }
  .card-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
}
@media (max-width: 480px) {
  .card-grid { grid-template-columns: 1fr; }
}
</style>
