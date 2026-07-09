<template>
  <div class="theme-warm">
    <main class="container">
      <RouterLink to="/health" class="back-link">← 返回心理健康</RouterLink>

      <div v-if="item.title" class="warm-card" style="margin-top: 24px; padding: 36px 32px;">
        <div class="health-detail-header">
          <div class="health-detail-icon">{{ item.icon }}</div>
          <h1 class="health-detail-title">{{ item.title }}</h1>
          <p class="health-detail-summary">{{ item.summary }}</p>
          <span class="health-detail-tag">{{ item.category }}</span>
        </div>

        <div v-if="item.warmNote" class="warm-note-box">
          <p>{{ item.warmNote }}</p>
        </div>

        <div class="warm-info-box">
          <strong>📚 仅供了解</strong> 请不要对号入座或自我诊断。如果你正在经历困难，请寻求专业帮助。
        </div>

        <div v-for="(section, i) in item.sections" :key="i" class="health-section">
          <h2 class="health-section-title">{{ section.title }}</h2>
          <div class="health-section-content" v-html="section.content"></div>

          <div v-if="section.symptoms && section.symptoms.length" class="health-symptoms">
            <div v-for="(sym, j) in section.symptoms" :key="j" class="health-symptom-item">
              <span class="warm-symptom-bullet"></span>
              <span>{{ sym }}</span>
            </div>
          </div>

          <div v-if="section.copingStrategies && section.copingStrategies.length" class="health-coping-grid">
            <div v-for="(cop, j) in section.copingStrategies" :key="j" class="warm-coping-card">
              <h3 class="health-coping-title">{{ cop.title }}</h3>
              <p class="health-coping-desc">{{ cop.desc }}</p>
            </div>
          </div>
        </div>

        <div v-if="item.bottomNote" class="warm-seek-help">
          <p>{{ item.bottomNote }}</p>
          <p style="margin-top: 10px;">如需心理援助：<strong>400-161-9995</strong></p>
        </div>
      </div>

      <div v-else>
        <h2>主题未找到</h2>
        <RouterLink to="/health">返回心理健康</RouterLink>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import healthData from '../../data/health.json'

const route = useRoute()
const item = ref({ sections: [] })

onMounted(() => {
  const slug = route.params.slug
  const found = healthData.find(h => h.slug === slug)
  if (found) item.value = { ...found, sections: found.sections || [] }
})
</script>

<style scoped>
.back-link {
  color: var(--warm-text-sub);
  text-decoration: none;
  font-size: 0.9rem;
  display: inline-block;
  padding: 6px 12px;
  border-radius: 8px;
  transition: background 0.2s;
}
.back-link:hover { background: rgba(246, 165, 192, 0.12); }

.health-detail-header {
  text-align: center;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px dashed rgba(246, 165, 192, 0.3);
}
.health-detail-icon { font-size: 3.2rem; line-height: 1; }
.health-detail-title {
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
  font-weight: 500;
  font-size: 2rem;
  margin: 12px 0 8px;
  letter-spacing: 0.04em;
  color: var(--warm-text);
}
.health-detail-summary {
  color: var(--warm-text-sub);
  font-size: 1.05rem;
  margin: 0 0 12px;
}
.health-detail-tag {
  display: inline-block;
  padding: 4px 14px;
  background: var(--warm-gradient);
  border-radius: 14px;
  font-size: 0.82rem;
  color: var(--warm-text);
  font-weight: 600;
}

.warm-info-box {
  background: var(--warm-bg);
  border-left: 4px solid var(--warm-secondary);
  padding: 12px 18px;
  border-radius: 10px;
  margin: 20px 0 28px;
  font-size: 0.9rem;
  color: var(--warm-text);
}

.health-section { margin-bottom: 32px; }
.health-section-title {
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
  font-size: 1.3rem;
  color: var(--warm-text);
  margin: 0 0 14px;
  font-weight: 500;
  letter-spacing: 0.03em;
}
.health-section-content {
  line-height: 1.85;
  color: var(--warm-text);
  font-size: 0.96rem;
}
.health-section-content :deep(h2),
.health-section-content :deep(h3) {
  color: var(--warm-text);
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
  font-weight: 500;
}
.health-section-content :deep(p) { margin: 10px 0; }
.health-section-content :deep(blockquote) {
  border-left: 3px solid var(--warm-primary);
  background: var(--warm-bg);
  padding: 10px 16px;
  margin: 12px 0;
  border-radius: 0 12px 12px 0;
  color: var(--warm-text-sub);
}

.health-symptoms { margin-top: 16px; }
.health-symptom-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
  color: var(--warm-text);
  font-size: 0.95rem;
}

.health-coping-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 18px;
}
.health-coping-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--warm-text);
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
}
.health-coping-desc {
  font-size: 0.88rem;
  color: var(--warm-text-sub);
  line-height: 1.6;
  margin: 0;
}
</style>
