<template>
  <main class="container" style="padding: 40px 20px; max-width: 800px; margin: 0 auto;">
    <RouterLink to="/health" class="back-link">← 返回心理健康</RouterLink>

    <div v-if="item.title">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 3rem;">{{ item.icon }}</div>
        <h1>{{ item.title }}</h1>
        <p style="color: #666; font-size: 1.1rem;">{{ item.summary }}</p>
        <span style="display: inline-block; margin-top: 8px; padding: 4px 12px; background: #f0f0f0; border-radius: 4px; font-size: 0.85rem;">{{ item.category }}</span>
      </div>

      <div v-if="item.warmNote" style="background: #fff8e1; border-left: 4px solid #ffc107; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <p>{{ item.warmNote }}</p>
      </div>

      <div style="background: #e3f2fd; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 0.9rem;">
        <strong>📚 仅供了解</strong> 请不要对号入座或自我诊断。
      </div>

      <div v-for="(section, i) in item.sections" :key="i" style="margin-bottom: 32px;">
        <h2>{{ section.title }}</h2>
        <div v-html="section.content" style="line-height: 1.8; color: #444;"></div>

        <div v-if="section.symptoms && section.symptoms.length" style="margin-top: 16px;">
          <div v-for="(sym, j) in section.symptoms" :key="j" style="display: flex; align-items: start; margin-bottom: 8px;">
            <span style="color: #4CAF50; margin-right: 8px;">•</span>
            <span>{{ sym }}</span>
          </div>
        </div>

        <div v-if="section.copingStrategies && section.copingStrategies.length" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 16px;">
          <div v-for="(cop, j) in section.copingStrategies" :key="j" style="padding: 16px; border: 1px solid #eee; border-radius: 8px;">
            <h3 style="font-size: 1rem; margin-bottom: 8px;">{{ cop.title }}</h3>
            <p style="font-size: 0.9rem; color: #666;">{{ cop.desc }}</p>
          </div>
        </div>
      </div>

      <div v-if="item.bottomNote" style="background: #f3e5f5; padding: 20px; border-radius: 12px; text-align: center; margin-top: 30px;">
        <p>{{ item.bottomNote }}</p>
        <p style="margin-top: 8px;">如需心理援助：<strong>400-161-9995</strong></p>
      </div>
    </div>

    <div v-else>
      <h2>主题未找到</h2>
      <RouterLink to="/health">返回心理健康</RouterLink>
    </div>
  </main>
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
