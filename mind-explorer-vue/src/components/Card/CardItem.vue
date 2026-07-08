<template>
  <div class="knowledge-card" :data-card-id="card.id">
    <span class="card-category">{{ card.category }}</span>
    <h3>{{ card.title }}</h3>
    <div class="proponent-badge"><span>👤 {{ card.proponent }}</span></div>
    <p class="card-summary">{{ card.summary }}</p>
    <RouterLink :to="`/card/${card.id}`" class="btn btn-small">查看详情</RouterLink>
  </div>
</template>

<script setup>
defineProps({
  card: { type: Object, required: true }
})
</script>
