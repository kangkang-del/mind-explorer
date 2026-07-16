<template>
  <main class="max-w-3xl mx-auto flex flex-col h-[calc(100vh-220px)] min-h-[420px]">
    <!-- 小木角色卡 -->
    <header class="flex items-center gap-3 mb-3 shrink-0">
      <div class="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#a8d5ba] to-[#7c9cb8] flex items-center justify-center text-[26px] shrink-0">🌿</div>
      <div class="flex-1">
        <h1 class="text-xl font-bold text-[#3a4a5c] m-0 leading-tight">同行者·小木</h1>
        <p class="text-[12px] text-[#9aa6b2] m-0">
          <span v-if="emotionLabel">此刻你似乎{{ emotionLabel }}{{ emotionEmoji }}</span>
          <span v-else>温柔的心理学家与哲学家，随时陪你聊聊</span>
        </p>
      </div>
      <button v-if="messages.length" @click="clearChat" class="text-[12px] text-[#9aa6b2] hover:text-[#e07a3f] transition px-2 py-1">清空</button>
    </header>

    <!-- 对话区 -->
    <section ref="scrollEl" class="flex-1 overflow-y-auto rounded-2xl bg-[#fafbfc] border border-[#eef2f7] p-4 space-y-3">
      <!-- 欢迎语 -->
      <div v-if="!messages.length" class="text-center text-[#9aa6b2] text-[14px] leading-8 py-10">
        <p>🌿 我是小木，这里没有对错，只有被认真听见的你。</p>
        <p>随便说点什么，或试着聊聊今天的心情。</p>
      </div>

      <!-- 消息气泡 -->
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="flex"
        :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[78%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words"
          :class="m.role === 'user'
            ? 'bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-br-sm'
            : 'bg-white border border-[#e6efe9] text-[#3a4a5c] rounded-bl-sm'"
        >
          <span v-if="m.role === 'assistant' && !m.content && m.thinking" class="text-[#9aa6b2]">小木正在听…</span>
          <span>{{ m.content }}</span>
          <span v-if="m.role === 'assistant' && m.thinking && m.content" class="inline-block w-1.5 h-4 ml-0.5 bg-[#9aa6b2] align-middle animate-blink"></span>
        </div>
      </div>
    </section>

    <!-- 危机干预弹窗 -->
    <div v-if="showCrisis" class="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4" @click.self="showCrisis = false">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-[#f0a868]">
        <div class="text-[24px] mb-2">🌿💛</div>
        <h3 class="text-lg font-bold text-[#3a4a5c] m-0 mb-2">你值得被好好接住</h3>
        <p class="text-[13px] text-[#5a6b7c] leading-7 m-0 mb-4">
          我听到了你此刻很重的疲惫。寻求 help 不是软弱，而是对自己温柔的勇气。如果可以，请让专业的人陪你走一段：
        </p>
        <ul class="text-[13px] text-[#3a4a5c] space-y-1.5 mb-4">
          <li>· 全国 24 小时心理援助热线：<b>400-161-9995</b></li>
          <li>· 北京心理危机研究与干预中心：<b>010-82951332</b></li>
          <li>· 希望 24 热线：<b>400-161-9995</b></li>
        </ul>
        <button @click="showCrisis = false" class="w-full py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-lg text-[14px] font-semibold">我知道了，小木陪着我</button>
      </div>
    </div>

    <!-- 输入区 -->
    <footer class="mt-3 shrink-0 flex items-end gap-2">
      <textarea
        v-model="input"
        rows="1"
        @keydown.enter.exact.prevent="send"
        placeholder="和小木说点什么…（Enter 发送）"
        class="flex-1 max-h-32 px-4 py-3 border border-[#e0e6ec] rounded-2xl resize-none text-[14px] focus:outline-none focus:border-[#7c9cb8]"
      ></textarea>
      <button
        @click="send"
        :disabled="!input.trim() || sending"
        class="px-5 py-3 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-2xl text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-90 shrink-0"
      >
        {{ sending ? '…' : '发送' }}
      </button>
    </footer>
  </main>
</template>

<script setup>
import { ref, reactive, nextTick, onBeforeUnmount } from 'vue'
import { companionApi } from '../api/companion'

const STORAGE_KEY = 'xiaomu_history_v1'
const MAX_HISTORY = 12

const input = ref('')
const sending = ref(false)
const messages = reactive(loadHistory())
const scrollEl = ref(null)
const emotionLabel = ref('')
const emotionEmoji = ref('')
const showCrisis = ref(false)
let controller = null

// 当前助手消息的引用，用于流式追加
let activeAssistant = null

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveHistory() {
  try {
    // 仅持久化已完成（非 thinking）的消息
    const toSave = messages
      .filter((m) => !m.thinking)
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-MAX_HISTORY * 2)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    /* 忽略存储异常 */
  }
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

function clearChat() {
  if (!confirm('确定清空与小木的对话记录吗？')) return
  messages.splice(0, messages.length)
  emotionLabel.value = ''
  emotionEmoji.value = ''
  saveHistory()
}

function getHistory() {
  // 取最近若干条已完成消息作为上下文
  return messages
    .filter((m) => !m.thinking)
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-MAX_HISTORY)
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return

  // 用户消息
  messages.push({ role: 'user', content: text })
  input.value = ''
  sending.value = true
  await scrollToBottom()

  // 助手占位（流式填充）
  activeAssistant = reactive({ role: 'assistant', content: '', thinking: true })
  messages.push(activeAssistant)
  await scrollToBottom()

  const history = getHistory().slice(0, -1) // 不含刚加的用户消息已在后端拼

  controller = companionApi.streamChat({
    message: text,
    history,
    onMeta: (meta) => {
      if (meta.emotion) {
        emotionLabel.value = meta.emotion.label || ''
        emotionEmoji.value = meta.emotion.emoji || ''
      }
      if (meta.crisis) showCrisis.value = true
    },
    onDelta: (chunk) => {
      activeAssistant.thinking = false
      activeAssistant.content += chunk
      scrollToBottom()
    },
    onError: async (msg) => {
      // 服务不可用（如本地 dev 无函数 / 404）时，前端本地降级为模板语录
      if (isServiceUnavailable(msg)) {
        await localFallback(text)
      } else {
        activeAssistant.thinking = false
        activeAssistant.content += `\n〔小木暂时走神了：${msg}〕`
      }
    },
    onDone: () => {
      activeAssistant.thinking = false
      sending.value = false
      saveHistory()
    },
  })
}

// 判断是否为「服务不可用」类错误（用于本地降级）
function isServiceUnavailable(msg) {
  return !msg || /Failed to fetch|404|NetworkError|HTTP 4|load failed/i.test(msg)
}

// 本地降级：复制与后端一致的规则，逐字模拟打字机（无需后端/key 即可对话）
const CRISIS_WORDS = ['想死', '不想活', '活不下去', '自杀', '轻生', '结束生命', '伤害自己', '解脱', '一了百了', '去死']
function localDetect(text) {
  const crisis = CRISIS_WORDS.some((w) => text.includes(w))
  let emotion = { label: '平静', emoji: '🍃' }
  const rules = [
    { label: '有些焦虑', emoji: '😟', words: ['焦虑', '紧张', '害怕', '担心', '慌', '不安', '压力', '睡不着', '失眠'] },
    { label: '有些低落', emoji: '🌧️', words: ['难过', '伤心', '低落', '抑郁', '累', '疲惫', '孤独', '空虚', '失落', '想哭'] },
    { label: '有些愤怒', emoji: '😣', words: ['生气', '愤怒', '烦', '讨厌', '气死', '恨', '委屈'] },
    { label: '有些迷茫', emoji: '🌫️', words: ['迷茫', '不知道', '怎么办', '没有方向', '困惑', '纠结'] },
    { label: '有些温暖', emoji: '🌤️', words: ['谢谢', '感谢', '开心', '幸福', '幸运', '温暖', '喜欢', '爱'] },
  ]
  for (const r of rules) {
    if (r.words.some((w) => text.includes(w))) {
      emotion = { label: r.label, emoji: r.emoji }
      break
    }
  }
  return { crisis, emotion }
}

function localReply(text, crisis, emotion) {
  if (crisis) {
    return '我听到了你此刻很重的疲惫，也很心疼。寻求帮助不是软弱，而是对自己温柔的勇气。如果你愿意，可以拨打援助热线：\n· 全国 24 小时心理援助热线：400-161-9995\n· 北京心理危机研究与干预中心：010-82951332\n我会一直在这里陪着你。'
  }
  if (emotion.label.includes('焦虑')) return '听起来你心里绷着一根弦。先一起慢慢吐口气——你最担心的是哪一件事呢？'
  if (emotion.label.includes('低落')) return '我感觉到你有些累了。没关系，今天可以允许自己慢一点。你愿意说说，是从什么时候开始觉得沉重的吗？'
  if (emotion.label.includes('愤怒')) return '这件事让你很不舒服，你的生气是有道理的。最让你委屈的是哪一点呢？'
  if (emotion.label.includes('迷茫')) return '站在分岔路口确实会晃神。我们先不想「正确答案」，你心里更偏向、哪怕只一点点想要的方向是什么？'
  if (emotion.label.includes('温暖')) return '能感受到你此刻的暖意，真好。这些小小的光亮，值得被好好记住。'
  return '我在听。你愿意多说一点此刻心里的感受吗？不用整理，想到什么就说什么。'
}

async function localFallback(text) {
  const { crisis, emotion } = localDetect(text)
  emotionLabel.value = emotion.label
  emotionEmoji.value = emotion.emoji
  if (crisis) showCrisis.value = true
  const reply = localReply(text, crisis, emotion)
  activeAssistant.thinking = false
  for (const ch of reply) {
    activeAssistant.content += ch
    if ('，。、；：！？\n'.includes(ch)) await new Promise((r) => setTimeout(r, 45))
    scrollToBottom()
  }
  sending.value = false
  saveHistory()
}

onBeforeUnmount(() => {
  controller?.abort()
})
</script>

<style scoped>
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.animate-blink { animation: blink 1s step-end infinite; }
</style>
