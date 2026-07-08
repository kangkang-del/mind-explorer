<template>
  <main class="container" style="padding: 40px 20px; max-width: 1200px; margin: 0 auto;">
    <h1>了解心理</h1>
    <p>心理健康知识科普 · {{ healthItems.length }}个主题</p>
    <div class="health-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; margin-top: 30px;">
      <RouterLink v-for="item in healthItems" :key="item.slug" :to="`/health/${item.slug}`" class="health-card" style="display: block; padding: 24px; border: 1px solid #eee; border-radius: 12px; text-decoration: none; color: inherit; transition: box-shadow 0.2s;">
        <div style="font-size: 2rem; margin-bottom: 8px;">{{ item.icon }}</div>
        <h3>{{ item.title }}</h3>
        <p style="color: #666; font-size: 0.9rem;">{{ item.summary }}</p>
        <span style="display: inline-block; margin-top: 8px; padding: 2px 8px; background: #f0f0f0; border-radius: 4px; font-size: 0.75rem; color: #888;">{{ item.category }}</span>
      </RouterLink>
    </div>
  </main>
</template>

<script setup>
import healthData from '../../data/health.json'
const healthItems = healthData
</script>
