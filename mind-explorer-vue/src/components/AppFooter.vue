<template>
  <footer class="app-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="footer-logo">🧠 心灵探索</span>
        <p class="footer-slogan">用科学理解心灵，以知识温暖生活</p>
      </div>

      <div class="footer-links">
        <RouterLink to="/knowledge">了解心理学知识</RouterLink>
        <RouterLink to="/companion">同行者</RouterLink>
        <RouterLink to="/sunny">心灵晴天</RouterLink>
        <RouterLink to="/feedback">反馈与建议</RouterLink>
      </div>

      <!-- 心理援助热线（陪伴型站点的伦理底线） -->
      <div class="footer-hotline">
        <span class="hotline-label">心理援助热线</span>
        <a href="tel:4001619995" class="hotline-num">400-161-9995</a>
        <span class="hotline-tip">（24小时·全国）</span>
      </div>
    </div>

    <div class="footer-bottom">
      <span>© {{ year }} 心灵探索 Mind Explorer</span>
      <span class="footer-icp">基于 Vue 3 · 仅用于学习交流</span>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
const year = computed(() => new Date().getFullYear())
</script>

<style scoped>
.app-footer {
  background: #f7f9fc;
  border-top: 1px solid #eef2f7;
  color: #7a8694;
  font-size: 14px;
}
.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 16px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}
.footer-brand { min-width: 200px; }
.footer-logo { font-weight: 700; color: #3a4a5c; font-size: 16px; }
.footer-slogan { margin: 6px 0 0; color: #9aa6b2; }

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.footer-links a {
  color: #5a6b7c;
  text-decoration: none;
}
.footer-links a:hover { color: #7c9cb8; }

.footer-hotline {
  background: #fff;
  border: 1px solid #f0d8c0;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hotline-label { font-size: 12px; color: #c8895a; }
.hotline-num { color: #e07a3f; font-weight: 700; font-size: 18px; text-decoration: none; }
.hotline-tip { font-size: 11px; color: #b8b8b8; }

.footer-bottom {
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 16px;
  border-top: 1px solid #eef2f7;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  font-size: 12px;
  color: #a8b2bc;
}

@media (max-width: 600px) {
  .footer-inner { flex-direction: column; }
  .footer-bottom { flex-direction: column; }
}
</style>
