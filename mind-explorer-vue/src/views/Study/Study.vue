<template>
  <main class="container" style="padding: 40px 20px; max-width: 1200px; margin: 0 auto;">
    <h1>📖 知识学习</h1>
    <div class="filter-bar">
      <a href="/study" class="filter-tag active">全部 ({{ cards.length }})</a>
      <a href="#" class="filter-tag" v-for="cat in categories" :key="cat">{{ cat.name }} ({{ cat.count }})</a>
    </div>
    <div class="card-grid">
      <CardItem v-for="card in cards" :key="card.id" :card="card" />
    </div>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import CardItem from '../../components/Card/CardItem.vue'
import cards from '../../data/cards.json'

const categories = computed(() => {
  const map = {}
  cards.forEach(c => { map[c.category] = (map[c.category] || 0) + 1 })
  return Object.entries(map).map(([name, count]) => ({ name, count }))
})
</script>
