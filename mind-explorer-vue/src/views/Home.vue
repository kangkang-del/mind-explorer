<template>
  <main class="home">
    <!-- Hero 区 -->
    <section class="hero">
      <span class="hero-badge">🌱 用科学理解心灵</span>
      <h1 class="hero-title">
        用科学理解心灵<br />
        <span class="hero-accent">以知识温暖生活</span>
      </h1>
      <p class="hero-subtitle">此刻，允许自己只是存在。</p>
    </section>

    <!-- 四大入口 -->
    <section class="entries">
      <RouterLink to="/knowledge" class="entry entry-blue">
        <span class="entry-icon">📚</span>
        <span class="entry-title">了解心理学知识</span>
        <span class="entry-desc">知识卡片 · 心理疾病科普 · 心理学家 · 经典实验</span>
      </RouterLink>

      <RouterLink to="/companion" class="entry entry-green">
        <span class="entry-icon">🌿</span>
        <span class="entry-title">同行者·小木</span>
        <span class="entry-desc">一位温柔的心理学家和哲学家，随时陪你聊聊</span>
      </RouterLink>

      <RouterLink to="/sunny" class="entry entry-orange">
        <span class="entry-icon">☀️</span>
        <span class="entry-title">心灵晴天</span>
        <span class="entry-desc">猫狗 · 善意行为 · 美好环境，推送温暖时刻</span>
      </RouterLink>

      <RouterLink to="/feedback" class="entry entry-purple">
        <span class="entry-icon">✉️</span>
        <span class="entry-title">反馈与建议</span>
        <span class="entry-desc">告诉我们你的想法，让心灵探索更好</span>
      </RouterLink>
    </section>

    <!-- 今日精选（P2 心灵晴天阶段接入真实数据） -->
    <section class="today">
      <h2 class="section-title">今日精选</h2>
      <p class="placeholder"> ☀️ 此处将展示「心灵晴天」每日精选流 —— 用户 24 小时内发布的内容优先，不足时由系统自动推送温暖内容补位。</p>
    </section>
  </main>
</template>

<script setup>
// P0 首页占位：Hero + 四大入口 + 今日精选预留位
</script>

<style scoped>
.home { padding: 8px 0; }

.hero {
  text-align: center;
  padding: 56px 16px 40px;
}
.hero-badge {
  display: inline-block;
  padding: 4px 12px;
  background: #eef4f9;
  color: #7c9cb8;
  border-radius: 20px;
  font-size: 13px;
  margin-bottom: 18px;
}
.hero-title {
  font-size: 36px;
  font-weight: 800;
  color: #3a4a5c;
  margin: 0 0 14px;
  line-height: 1.3;
}
.hero-accent {
  background: linear-gradient(90deg, #7c9cb8, #f0a868);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-subtitle {
  color: #9aa6b2;
  font-size: 16px;
  margin: 0;
}

.entries {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin: 24px 0;
}
.entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 22px 20px;
  border-radius: 14px;
  text-decoration: none;
  background: #fff;
  border: 1px solid #eef2f7;
  transition: transform 0.2s, box-shadow 0.2s;
}
.entry:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
}
.entry-icon { font-size: 28px; }
.entry-title { font-size: 17px; font-weight: 700; color: #3a4a5c; }
.entry-desc { font-size: 13px; color: #9aa6b2; }

.entry-blue:hover { border-color: #c5d8ea; }
.entry-green:hover { border-color: #bfe0cb; }
.entry-orange:hover { border-color: #f5d2b0; }
.entry-purple:hover { border-color: #d8c9e8; }

.today {
  margin-top: 32px;
}
.section-title {
  font-size: 20px;
  font-weight: 700;
  color: #3a4a5c;
  margin: 0 0 12px;
}
.placeholder {
  padding: 24px;
  background: #fafbfc;
  border: 1px dashed #e0e6ec;
  border-radius: 12px;
  color: #9aa6b2;
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
}

@media (max-width: 640px) {
  .hero-title { font-size: 28px; }
  .entries { grid-template-columns: 1fr; }
}
</style>
