<template>
  <main class="page profile">
    <header class="page-head">
      <h1>👤 个人中心</h1>
    </header>

    <!-- 用户信息卡 -->
    <section class="user-card">
      <div class="uc-avatar">访客</div>
      <div class="uc-info">
        <h2>访客用户</h2>
        <p class="uc-sub">登录后可同步收藏、对话记录与反馈</p>
        <button class="login-btn">登录 / 注册</button>
      </div>
    </section>

    <!-- 功能区占位 -->
    <section class="blocks">
      <div class="block">
        <span class="block-icon">⭐</span>
        <span class="block-title">我的收藏</span>
        <span class="block-tag">待实现</span>
      </div>
      <div class="block">
        <span class="block-icon">💬</span>
        <span class="block-title">对话记录</span>
        <span class="block-tag">待实现</span>
      </div>
      <div class="block">
        <span class="block-icon">✉️</span>
        <span class="block-title">我的反馈</span>
        <span class="block-tag">待实现</span>
      </div>
      <div class="block">
        <span class="block-icon">☀️</span>
        <span class="block-title">我的晴天</span>
        <span class="block-tag">待实现</span>
      </div>
    </section>
  </main>
</template>

<script setup>
// P1 阶段接入登录系统后完善
</script>

<style scoped>
.profile { max-width: 760px; }

.page-head { margin-bottom: 20px; }
.page-head h1 { font-size: 24px; color: #3a4a5c; margin: 0; }

.user-card {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 22px;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 14px;
  margin-bottom: 20px;
}
.uc-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c9cb8, #a8c3d6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}
.uc-info h2 { margin: 0; font-size: 18px; color: #3a4a5c; }
.uc-sub { margin: 4px 0 10px; color: #9aa6b2; font-size: 13px; }
.login-btn {
  padding: 6px 18px;
  background: #7c9cb8;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.login-btn:hover { opacity: 0.92; }

.blocks {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.block {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 12px;
  transition: border-color 0.2s;
}
.block:hover { border-color: #c5d8ea; }
.block-icon { font-size: 22px; }
.block-title { font-size: 15px; color: #3a4a5c; font-weight: 600; }
.block-tag {
  margin-left: auto;
  font-size: 11px;
  color: #b8b8b8;
  background: #f7f9fc;
  padding: 2px 8px;
  border-radius: 10px;
}

@media (max-width: 600px) {
  .blocks { grid-template-columns: 1fr; }
}
</style>
