<template>
  <main class="page sunny">
    <header class="page-head">
      <h1>☀️ 心灵晴天</h1>
      <p>推送温馨美好的时刻：猫狗、善意的行为、美好的环境，让心里放晴。</p>
    </header>

    <!-- 分类 Tab 占位 -->
    <nav class="cat-tabs">
      <button class="cat active">🌿 全部</button>
      <button class="cat">🐱 猫狗</button>
      <button class="cat">🤝 善意</button>
      <button class="cat">🌅 美好环境</button>
    </nav>

    <!-- 内容流占位 -->
    <section class="feed-placeholder">
      <span class="tag">P2 待实现</span>
      <p>此处将展示温暖内容流（形似社区，带防冷场自动推送）：</p>
      <ul>
        <li>用户发帖（图文）+ 点赞 / 认同 + 评论</li>
        <li>每天固定自动推送：猫狗图（The Cat/Dog API）、善意文案（AI 生成）、小木语录</li>
        <li>自动推送帖带「✨ 今日晴天」标签，用户也能点赞评论</li>
        <li>首页「今日精选」从此处按优先级选取（用户 24h 内发帖 → 自动推送）</li>
      </ul>
    </section>
  </main>
</template>

<script setup>
// P2 阶段实现：内容流 + P3 自动推送
</script>

<style scoped>
.page-head { text-align: center; margin-bottom: 20px; }
.page-head h1 { font-size: 26px; color: #3a4a5c; margin: 0 0 8px; }
.page-head p { color: #9aa6b2; margin: 0; }

.cat-tabs {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.cat {
  padding: 7px 16px;
  border: 1px solid #eef2f7;
  background: #fff;
  border-radius: 20px;
  cursor: pointer;
  color: #5a6b7c;
  font-size: 14px;
  transition: all 0.2s;
}
.cat:hover { border-color: #f5d2b0; }
.cat.active {
  background: #fff3e0;
  border-color: #f0a868;
  color: #e07a3f;
  font-weight: 600;
}

.feed-placeholder {
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
.feed-placeholder ul { margin: 8px 0 0; padding-left: 20px; }
</style>
