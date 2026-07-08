<template>
  <main class="container" style="padding: 40px 20px; max-width: 800px; margin: 0 auto;">
    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="!card" class="not-found">
      <p>卡片不存在或已被移除</p>
      <RouterLink to="/study" class="back-link">← 返回学习页</RouterLink>
    </div>

    <article v-else class="card-detail">
      <RouterLink to="/study" class="back-link">← 返回学习页</RouterLink>

      <span class="card-category">{{ card.category || '未分类' }}</span>
      <h1>{{ card.title }}</h1>
      <div class="author-badge">👤 由 {{ card.author_name }} 贡献</div>

      <div class="content" v-html="formattedContent"></div>

      <div v-if="card.source" class="source">来源: {{ card.source }}</div>
      <div class="status-line" v-if="card.status !== 'approved'">
        状态: {{ statusText(card.status) }}
      </div>
    </article>
  </main>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { userCardsApi } from '../../api/userCards'

const props = defineProps({ id: String })
const card = ref(null)
const loading = ref(true)

const formattedContent = computed(() => {
  if (!card.value?.content) return ''
  return card.value.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
})

function statusText(s) {
  return { pending: '审核中', approved: '已通过', rejected: '已拒绝' }[s] || s
}

onMounted(async () => {
  try {
    card.value = await userCardsApi.getById(props.id)
  } catch (e) {
    card.value = null
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.loading, .not-found { text-align: center; padding: 60px; color: var(--text-light); }
.back-link { display: inline-block; margin-bottom: 20px; color: var(--primary); text-decoration: none; }
.card-category { display: inline-block; background: var(--primary); color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; margin-bottom: 12px; }
h1 { font-size: 2rem; margin-bottom: 12px; }
.author-badge { color: var(--text-light); margin-bottom: 24px; }
.content { line-height: 1.9; font-size: 1.05rem; }
.source { margin-top: 24px; padding: 12px; background: var(--bg); border-radius: 8px; font-size: 0.9rem; color: var(--text-light); }
.status-line { margin-top: 16px; font-size: 0.9rem; color: var(--warning); }
</style>
