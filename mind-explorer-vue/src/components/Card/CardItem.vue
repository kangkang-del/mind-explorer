<template>
  <div class="knowledge-card" :data-card-id="card.id">
    <div class="card-head">
      <span class="card-category">{{ card.category }}</span>
      <span v-if="card.featured" class="featured-badge">✨精选</span>
    </div>
    <h3>{{ card.title }}</h3>
    <div class="proponent-badge"><span>👤 {{ card.proponent }}</span></div>
    <p class="card-summary">{{ card.summary }}</p>
    <div class="flex items-center justify-between gap-2">
      <RouterLink :to="card.isUserCard ? `/user-card/${card.id}` : `/card/${card.id}`" class="btn btn-small">
        查看详情
      </RouterLink>
      <div class="flex items-center gap-2">
        <button
          v-if="card.isUserCard"
          class="hug-btn"
          :class="{ hugged }"
          :disabled="hugging"
          @click="onHug"
          :title="hugged ? '取消抱抱' : '抱抱一下'"
        >
          🤗 {{ hugs }}
        </button>
        <FavoriteButton :type="card.isUserCard ? 'moment' : 'card'" :id="card.id" :title="card.title" :summary="card.summary" :link="card.isUserCard ? `/user-card/${card.id}` : `/card/${card.id}`" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import FavoriteButton from '../FavoriteButton.vue'
import { userCardsApi } from '../../api/userCards'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  card: { type: Object, required: true }
})

const auth = useAuthStore()
const hugs = ref(props.card.hugs || 0)
const hugged = ref(!!props.card.hugged)
const hugging = ref(false)

function uidOf() {
  const u = auth.currentUser
  if (!u) return null
  return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
}

async function onHug() {
  if (hugging.value) return
  const uid = uidOf()
  if (!uid) {
    alert('请先登录或成为游客后再抱抱 🤗')
    return
  }
  hugging.value = true
  const before = hugged.value
  // 乐观更新
  hugged.value = !before
  hugs.value += before ? -1 : 1
  try {
    const r = await userCardsApi.toggleHug(props.card.id, uid, auth.currentUser.type)
    hugs.value = r.count
    hugged.value = r.hugged
  } catch (e) {
    // 回滚
    hugged.value = before
    hugs.value += before ? 1 : -1
    alert('抱抱失败：' + (e.message || '请稍后再试'))
  } finally {
    hugging.value = false
  }
}
</script>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.featured-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #b4791f;
  background: linear-gradient(135deg, #fff3d6, #ffe2a8);
  border: 1px solid #f3d28a;
}
.hug-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1.5px solid #f0c9c9;
  border-radius: 999px;
  background: #fff;
  color: #c97b7b;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}
.hug-btn:hover {
  background: #fff4f4;
  border-color: #e6a3a3;
  transform: translateY(-1px);
}
.hug-btn.hugged {
  background: linear-gradient(135deg, #f7c9c9, #f0b0b0);
  color: #fff;
  border-color: transparent;
}
.hug-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
