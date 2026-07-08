<template>
  <main class="main-content">
    <section class="hero">
      <h1 class="hero-title">用科学理解心灵，以知识温暖生活</h1>
      <p class="hero-subtitle">96张知识卡片 · 20种心理疾病科普 · 16位心理学家 · 18个经典实验</p>
      <RouterLink to="/study" class="hero-btn">开始学习</RouterLink>
    </section>

    <section class="card-grid-section" style="padding: 40px 20px; max-width: 1200px; margin: 0 auto;">
      <h2 style="text-align: center; margin-bottom: 30px;">热门知识卡片</h2>
      <div class="card-grid">
        <CardItem v-for="card in cards.slice(0, 12)" :key="card.id" :card="card" />
      </div>
    </section>
  </main>
</template>

<script setup>
import CardItem from '../components/Card/CardItem.vue'
import cards from '../data/cards.json'
</script>
