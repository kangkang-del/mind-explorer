<template>
  <div class="theme-warm">
    <main class="container">
      <section class="health-hero">
        <h1>了解心理</h1>
        <p>心理健康知识科普 · {{ healthItems.length }} 个主题</p>
        <p class="health-hero-sub">愿你温柔地理解自己，也被世界温柔相待</p>
      </section>

      <div class="health-grid">
        <RouterLink
          v-for="item in healthItems"
          :key="item.slug"
          :to="`/health/${item.slug}`"
          class="warm-card health-card"
        >
          <div class="health-card-icon">{{ item.icon }}</div>
          <h3 class="health-card-title">{{ item.title }}</h3>
          <p class="health-card-desc">{{ item.summary }}</p>
          <span class="health-card-tag">{{ item.category }}</span>
        </RouterLink>
      </div>
    </main>
  </div>
</template>

<script setup>
import healthData from '../../data/health.json'
const healthItems = healthData
</script>

<style scoped>
.health-hero-sub {
  font-size: 0.95rem;
  opacity: 0.75;
  margin-top: 8px;
  font-style: italic;
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
  letter-spacing: 0.04em;
}

.health-card {
  text-decoration: none;
  color: var(--warm-text);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  position: relative;
  overflow: hidden;
}
.health-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--warm-primary), var(--warm-secondary));
  opacity: 0;
  transition: opacity 0.3s;
}
.health-card:hover::before { opacity: 1; }

.health-card-icon {
  font-size: 2.2rem;
  line-height: 1;
  transition: transform 0.3s;
}
.health-card:hover .health-card-icon {
  transform: scale(1.15) rotate(-3deg);
}

.health-card-title {
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
  font-weight: 500;
  font-size: 1.25rem;
  margin: 0;
  letter-spacing: 0.03em;
}

.health-card-desc {
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--warm-text-sub);
  flex: 1;
  margin: 0;
}

.health-card-tag {
  display: inline-block;
  padding: 3px 12px;
  background: var(--warm-gradient);
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--warm-text);
  font-weight: 600;
}
</style>
