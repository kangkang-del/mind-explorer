<template>
  <div class="knowledge-card" :data-card-id="card.id">
    <span class="card-category">{{ card.category }}</span>
    <h3>{{ card.title }}</h3>
    <div class="proponent-badge"><span>👤 {{ card.proponent }}</span></div>
    <p class="card-summary">{{ card.summary }}</p>
    <div class="flex items-center justify-between gap-2">
      <RouterLink :to="card.isUserCard ? `/user-card/${card.id}` : `/card/${card.id}`" class="btn btn-small">
        查看详情
      </RouterLink>
      <FavoriteButton :type="card.isUserCard ? 'moment' : 'card'" :id="card.id" :title="card.title" :summary="card.summary" :link="card.isUserCard ? `/user-card/${card.id}` : `/card/${card.id}`" />
    </div>
  </div>
</template>

<script setup>
import FavoriteButton from '../FavoriteButton.vue'
defineProps({
  card: { type: Object, required: true }
})
</script>
