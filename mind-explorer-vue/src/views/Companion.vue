<template>
  <main class="page companion">
    <header class="page-head">
      <h1>🌿 同行者·小木</h1>
      <p>一位温柔的心理学家和哲学家，不评判、善倾听，用通俗语言陪你聊聊。</p>
    </header>

    <!-- 小木角色卡 -->
    <section class="companion-card">
      <div class="cc-avatar">🌿</div>
      <div class="cc-info">
        <h2>小木</h2>
        <p class="cc-role">心理学家 · 哲学家</p>
        <p class="cc-quote">“你不必时时坚强，在这里可以只是你自己。”</p>
      </div>
    </section>

    <!-- 对话区占位 -->
    <section class="chat-placeholder">
      <span class="tag">P4 待实现</span>
      <p>此处将接入 AI 对话：</p>
      <ul>
        <li>流式对话（打字机效果）</li>
        <li>历史对话记录（按日期分组）</li>
        <li>情绪感知 + 危机干预（识别自伤倾向时弹出援助热线）</li>
        <li>每日陪伴语 · 小木语录</li>
      </ul>
    </section>
  </main>
</template>

<script setup>
// P4 阶段实现：接入大模型 API + 角色设定 + 危机干预
</script>

<style scoped>
.companion { max-width: 760px; }

.page-head { text-align: center; margin-bottom: 24px; }
.page-head h1 { font-size: 26px; color: #3a4a5c; margin: 0 0 8px; }
.page-head p { color: #9aa6b2; margin: 0; }

.companion-card {
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 24px;
  background: linear-gradient(135deg, #f4faf6, #eef4f9);
  border: 1px solid #e6efe9;
  border-radius: 16px;
  margin-bottom: 20px;
}
.cc-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a8d5ba, #7c9cb8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  flex-shrink: 0;
}
.cc-info h2 { margin: 0; font-size: 20px; color: #3a4a5c; }
.cc-role { margin: 4px 0; color: #7c9cb8; font-size: 13px; }
.cc-quote { margin: 8px 0 0; color: #6b7a8a; font-style: italic; }

.chat-placeholder {
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
  background: #e6efe9;
  color: #5a8a6a;
  border-radius: 12px;
  font-size: 12px;
  margin-bottom: 10px;
}
.chat-placeholder ul { margin: 8px 0 0; padding-left: 20px; }
</style>
