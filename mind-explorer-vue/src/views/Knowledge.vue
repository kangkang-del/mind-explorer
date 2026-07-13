<template>
  <main class="page">
    <header class="page-head">
      <h1>📚 了解心理学知识</h1>
      <p>心理学知识库：知识卡片、心理疾病科普、心理学家介绍、经典实验。</p>
    </header>

    <div class="placeholder-card">
      <span class="tag">P1 待实现</span>
      <p>此处将整合旧版 Study / Card / Health / Theorists 模块：</p>
      <ul>
        <li>左侧分类树（卡片 / 疾病 / 心理学家 / 实验）</li>
        <li>右侧卡片网格 + 顶部搜索 + 筛选标签</li>
        <li>复用已有的 <code>cards.json</code>（96 张）与 <code>health.json</code>（20 种）</li>
      </ul>
    </div>
  </main>
</template>

<script setup>
// P1 阶段实现：复用旧版数据，Vue3 化展示
</script>

<style scoped>
.page-head { text-align: center; margin-bottom: 24px; }
.page-head h1 { font-size: 26px; color: #3a4a5c; margin: 0 0 8px; }
.page-head p { color: #9aa6b2; margin: 0; }

.placeholder-card {
  padding: 28px;
  background: #fafbfc;
  border: 1px dashed #e0e6ec;
  border-radius: 12px;
  color: #5a6b7c;
  line-height: 1.8;
}
.tag {
  display: inline-block;
  padding: 2px 10px;
  background: #fff3e0;
  color: #e07a3f;
  border-radius: 12px;
  font-size: 12px;
  margin-bottom: 10px;
}
.placeholder-card ul { margin: 8px 0 0; padding-left: 20px; }
.placeholder-card code {
  background: #eef2f7;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13px;
}
</style>
