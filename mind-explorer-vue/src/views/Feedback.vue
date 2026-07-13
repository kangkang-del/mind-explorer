<template>
  <main class="page feedback">
    <header class="page-head">
      <h1>✉️ 反馈与建议</h1>
      <p>你的每一条声音，都会让心灵探索更温暖。</p>
    </header>

    <form class="feedback-form" @submit.prevent="onSubmit">
      <label class="field">
        <span class="label">类型</span>
        <div class="types">
          <label v-for="t in types" :key="t.value" class="type">
            <input type="radio" v-model="form.type" :value="t.value" />
            <span>{{ t.label }}</span>
          </label>
        </div>
      </label>

      <label class="field">
        <span class="label">内容</span>
        <textarea v-model="form.content" rows="5" placeholder="说说你的想法、遇到的问题，或想感谢的事…"></textarea>
      </label>

      <label class="field-inline">
        <input type="checkbox" v-model="form.anonymous" />
        <span>匿名提交</span>
      </label>

      <button type="submit" class="submit-btn" :disabled="!form.content.trim()">
        提交反馈
      </button>
    </form>
  </main>
</template>

<script setup>
import { reactive } from 'vue'

const types = [
  { value: 'suggest', label: '💡 建议' },
  { value: 'issue', label: '🐛 问题' },
  { value: 'thanks', label: '🙏 感谢' },
]

const form = reactive({
  type: 'suggest',
  content: '',
  anonymous: false,
})

function onSubmit() {
  // P1 阶段接入后端：netlify/functions 反馈接口
  alert(`已收到你的${form.anonymous ? '匿名' : ''}反馈（演示，尚未接入后端）`)
  form.content = ''
}
</script>

<style scoped>
.feedback { max-width: 640px; }

.page-head { text-align: center; margin-bottom: 24px; }
.page-head h1 { font-size: 26px; color: #3a4a5c; margin: 0 0 8px; }
.page-head p { color: #9aa6b2; margin: 0; }

.feedback-form {
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 14px; color: #5a6b7c; font-weight: 600; }
.types { display: flex; gap: 12px; flex-wrap: wrap; }
.type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #eef2f7;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  color: #5a6b7c;
}
.type input { accent-color: #7c9cb8; }

textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #e0e6ec;
  border-radius: 8px;
  resize: vertical;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}
textarea:focus {
  outline: none;
  border-color: #7c9cb8;
}

.field-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5a6b7c;
  font-size: 14px;
}
.field-inline input { accent-color: #7c9cb8; }

.submit-btn {
  align-self: flex-start;
  padding: 10px 28px;
  background: linear-gradient(135deg, #7c9cb8, #a8c3d6);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.submit-btn:hover { opacity: 0.92; }
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
