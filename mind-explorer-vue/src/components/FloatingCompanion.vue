<template>
  <RouterLink to="/companion" class="floating-companion" aria-label="与同行者小木对话">
    <div class="fc-avatar">
      <span class="fc-face">🌿</span>
      <span class="fc-pulse"></span>
    </div>
    <div class="fc-tip">
      <span class="fc-name">小木</span>
      <span class="fc-desc">随时陪你聊聊</span>
    </div>
  </RouterLink>
</template>

<script setup>
// 右下角常驻入口：任何页面都能一键唤起同行者小木
</script>

<style scoped>
.floating-companion {
  position: fixed;
  right: 20px;
  bottom: 24px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 8px;
  background: #fff;
  border: 1px solid #e6efe9;
  border-radius: 40px;
  box-shadow: 0 6px 20px rgba(124, 156, 184, 0.18);
  text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;
}
.floating-companion:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 26px rgba(124, 156, 184, 0.28);
}
.fc-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a8d5ba, #7c9cb8);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fc-face { font-size: 20px; }
.fc-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid #a8d5ba;
  animation: pulse 2.2s ease-out infinite;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(1.6); opacity: 0; }
}
.fc-tip {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.fc-name { font-size: 14px; font-weight: 700; color: #3a4a5c; }
.fc-desc { font-size: 11px; color: #9aa6b2; }

/* 移动端只显示头像 */
@media (max-width: 600px) {
  .fc-tip { display: none; }
  .floating-companion { padding: 6px; }
}
</style>
