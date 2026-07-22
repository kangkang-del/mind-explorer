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

    <!-- 引导入口（陪伴深度） -->
    <div class="mb-2 shrink-0">
      <div v-if="showGuidesHint" class="flex items-center gap-2 bg-[#f0f4f9] rounded-xl px-3 py-1.5 mb-2">
        <span class="text-[12px] text-[#5a7d9a] leading-5 flex-1">小木准备了几件可以一起做的事，点下面试试 👇</span>
        <button @click="dismissGuidesHint" class="text-[#9aa6b2] hover:text-[#5a7d9a] text-[14px] leading-none">×</button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="g in guides"
          :key="g.key"
          @click="openGuide(g.key)"
          :title="g.desc"
          class="px-3 py-1.5 rounded-full text-[12.5px] border transition"
          :class="guide === g.key ? 'bg-[#eef4f9] border-[#c5d8ea] text-[#5a7d9a] font-semibold' : 'bg-white border-[#eef2f7] text-[#7a8a9a] hover:border-[#c5d8ea]'"
        >
          {{ g.emoji }} {{ g.label }}
        </button>
      </div>
    </div>

    <!-- 情绪命名引导（陪伴深度） -->
    <div v-if="guide === 'mood'" class="bg-white rounded-2xl border border-[#eef2f7] p-4 mb-3 shrink-0">
      <p class="text-[13px] text-[#5a6b7c] mb-2.5 m-0">此刻，你感觉……（点一个，小木来接住你）</p>
      <div class="grid grid-cols-6 gap-2 mb-3">
        <button
          v-for="m in MOODS"
          :key="m.key"
          @click="pickEmotion(m)"
          class="flex flex-col items-center gap-0.5 py-2 rounded-xl border transition"
          :class="pickedEmotion === m.key ? 'border-[#7c9cb8] bg-[#f0f4f9] scale-[1.03]' : 'border-[#eef2f7] hover:border-[#c5d8ea]'"
        >
          <span class="text-[22px] leading-none">{{ m.emoji }}</span>
          <span class="text-[11px] text-[#5a6b7c]">{{ m.label }}</span>
        </button>
      </div>
      <div v-if="pickedEmotion" class="flex items-center gap-2 flex-wrap">
        <input v-model="moodNote" placeholder="想给今天的心情留句话？（可选）" class="flex-1 min-w-[160px] px-3 py-2 border border-[#e0e6ec] rounded-lg text-[13px] focus:outline-none focus:border-[#7c9cb8]" />
        <button
          @click="logMood"
          :disabled="moodLogging"
          class="px-4 py-2 rounded-lg bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white text-[13px] font-semibold disabled:opacity-50 transition hover:opacity-90"
        >
          {{ moodLogging ? '记入中…' : '记入心情 + 打卡' }}
        </button>
        <span class="text-[12px] text-[#9aa6b2]">{{ moodTip }}</span>
      </div>
    </div>

    <!-- 对话区 -->
    <section ref="scrollEl" class="flex-1 overflow-y-auto rounded-2xl bg-[#fafbfc] border border-[#eef2f7] p-4 space-y-3">
      <!-- 每日主动陪伴语（P5-2）：当天首次访问显示，可关闭 -->
      <div v-if="greeting" class="flex items-start gap-2 bg-gradient-to-r from-[#fff7ec] to-[#fef2f5] border border-[#f6dcc4] rounded-2xl px-4 py-3">
        <span class="text-[20px] shrink-0">🌅</span>
        <p class="flex-1 text-[13.5px] text-[#7a6a58] leading-7 m-0">{{ greeting }}</p>
        <button @click="dismissGreeting" class="text-[#b9a890] hover:text-[#8a7a66] text-[18px] leading-none shrink-0" aria-label="关闭">×</button>
      </div>

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
        <!-- 复盘周报卡片（陪伴深度） -->
        <div v-if="m.type === 'recap'" class="max-w-[90%] bg-white border border-[#e6efe9] rounded-2xl rounded-bl-sm p-4">
          <div class="flex items-center gap-2 mb-2.5">
            <span class="text-[16px]">📊</span>
            <b class="text-[14px] text-[#3a4a5c]">本周情绪复盘</b>
            <span class="ml-auto text-[11px] text-[#9aa6b2]">{{ m.recap?.count || 0 }} 条记录</span>
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2.5">
            <span class="px-2 py-0.5 rounded-full text-[11.5px] bg-[#eef4f9] text-[#5a7d9a]">高频 {{ m.recap?.topEmoji }} {{ moodLabelOf(m.recap?.topEmotion) }}</span>
            <span class="px-2 py-0.5 rounded-full text-[11.5px]" :class="trendChipClass(m.recap?.trend)">{{ m.recap?.trendLabel }}</span>
          </div>
          <p class="text-[13.5px] text-[#5a6b7c] leading-7 m-0">{{ m.recap?.text }}</p>
        </div>
        <!-- 文字气泡 -->
        <div
          v-else
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

    <!-- CBT 思维记录（陪伴深度） -->
    <div v-if="guide === 'cbt'" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" @click.self="guide = ''">
      <div class="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl max-h-[88vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[16px] font-bold text-[#3a4a5c] m-0">🧠 换个角度看一看</h3>
          <button @click="guide = ''" class="text-[#9aa6b2] hover:text-[#3a4a5c] text-xl leading-none">×</button>
        </div>
        <p class="text-[12.5px] text-[#9aa6b2] leading-6 m-0 mb-3">当脑中那句反复的话让你难受，试着把它摊开，和小木一起看看它是不是全部的真相。</p>
        <div class="space-y-2.5">
          <textarea v-model="cbt.situation" rows="2" placeholder="发生了什么？（情境）" class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[13.5px] resize-none focus:outline-none focus:border-[#7c9cb8]"></textarea>
          <textarea v-model="cbt.thought" rows="2" placeholder="脑中冒出的想法是……（自动思维）" class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[13.5px] resize-none focus:outline-none focus:border-[#7c9cb8]"></textarea>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="m in MOODS" :key="m.key" @click="cbt.emotion = m.key"
              class="px-2.5 py-1 rounded-full text-[12px] border transition"
              :class="cbt.emotion === m.key ? 'border-[#7c9cb8] bg-[#f0f4f9] text-[#5a7d9a]' : 'border-[#eef2f7] text-[#7a8a9a]'">
              {{ m.emoji }} {{ m.label }}
            </button>
          </div>
          <textarea v-model="cbt.evidenceFor" rows="2" placeholder="支持这个想法的证据……" class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[13.5px] resize-none focus:outline-none focus:border-[#7c9cb8]"></textarea>
          <textarea v-model="cbt.evidenceAgainst" rows="2" placeholder="不支持它的证据……（哪怕一点点）" class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[13.5px] resize-none focus:outline-none focus:border-[#7c9cb8]"></textarea>
          <textarea v-model="cbt.alternative" rows="2" placeholder="更平衡、更善意的想法是……" class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[13.5px] resize-none focus:outline-none focus:border-[#7c9cb8]"></textarea>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button @click="submitCbtForm" :disabled="cbtLoading"
            class="flex-1 py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-lg text-[14px] font-semibold disabled:opacity-50 transition hover:opacity-90">
            {{ cbtLoading ? '小木在读…' : '请小木陪我看看' }}
          </button>
          <button @click="guide = ''" class="px-4 py-2.5 rounded-lg text-[14px] text-[#5a6b7c] border border-[#e0e6ec] hover:bg-[#f0f4f9] transition">稍后</button>
        </div>
      </div>
    </div>

    <!-- 睡前仪式（陪伴深度） -->
    <div v-if="guide === 'bedtime'" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" @click.self="guide = ''">
      <div class="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[16px] font-bold text-[#3a4a5c] m-0">🌙 睡前一刻</h3>
          <button @click="guide = ''" class="text-[#9aa6b2] hover:text-[#3a4a5c] text-xl leading-none">×</button>
        </div>
        <p class="text-[13px] text-[#5a6b7c] leading-7 m-0 mb-3">
          先把注意力放到呼吸上，慢慢吸气、慢慢呼气。然后从脚到头，感受身体一点点松弛下来，把今天的重量交给床。
        </p>
        <p class="text-[13px] text-[#5a6b7c] m-0 mb-2">今天，有三件让你有一点点暖的小事吗？</p>
        <div class="space-y-2 mb-4">
          <input v-for="i in 3" :key="i" v-model="bedtime.gratitude[i - 1]" :placeholder="'第 ' + i + ' 件小确幸…'" class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[13.5px] focus:outline-none focus:border-[#7c9cb8]" />
        </div>
        <button @click="finishBedtime" class="w-full py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-lg text-[14px] font-semibold hover:opacity-90 transition">
          完成 · 和小木说晚安
        </button>
      </div>
    </div>

    <!-- 我的思录（CBT 历史回看，陪伴深度） -->
    <div v-if="guide === 'cbt-history'" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" @click.self="guide = ''">
      <div class="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[16px] font-bold text-[#3a4a5c] m-0">📖 我的思录</h3>
          <button @click="guide = ''" class="text-[#9aa6b2] hover:text-[#3a4a5c] text-xl leading-none">×</button>
        </div>
        <p v-if="!cbtHistory.length" class="text-[13px] text-[#9aa6b2] py-6 text-center m-0">还没有思维记录。做完一次「换个角度看」，这里会留下你的思录，方便回看。</p>
        <div v-else class="space-y-3">
          <div v-for="(r, idx) in cbtHistory" :key="idx" class="border border-[#eef2f7] rounded-xl p-3">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[11px] text-[#9aa6b2]">{{ fmtCbtTime(r.at) }}</span>
              <span v-if="r.emotion" class="text-[11px] px-1.5 py-0.5 rounded-full bg-[#eef4f9] text-[#5a7d9a]">{{ moodLabelOf(r.emotion) }}</span>
              <button @click="deleteCbtRecord(idx)" class="ml-auto text-[11px] text-[#b8c2cc] hover:text-[#e07a3f] transition">删除</button>
            </div>
            <p v-if="r.thought" class="text-[13px] text-[#3a4a5c] m-0 mb-1"><b>想法：</b>{{ r.thought }}</p>
            <p v-if="r.alternative" class="text-[13px] text-[#4a8a5e] m-0 mb-1"><b>更平衡：</b>{{ r.alternative }}</p>
            <p v-if="r.suggestion" class="text-[12.5px] text-[#5a6b7c] leading-6 m-0 mt-1.5 pt-1.5 border-t border-[#f0f4f9]">小木：{{ r.suggestion }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <footer class="mt-3 shrink-0 flex items-end gap-2">
      <textarea
        ref="inputEl"
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
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { companionApi } from '../api/companion'
import { moodApi } from '../api/mood'
import { checkinsApi } from '../api/checkins'
import { useAuthStore } from '../stores/auth'
import { useBadgeStore } from '../stores/badges'
import { useCrisisStore } from '../stores/crisisStore'
import { detectCrisis, crisisReply } from '../lib/crisis'

const auth = useAuthStore()
const badgesStore = useBadgeStore()
const crisisStore = useCrisisStore()
// 用户标识（服务端记忆用）：guest→g:{id}，github→gh:{username}；未登录为空（走本地 localStorage）
const userId = computed(() => {
  const u = auth.currentUser
  if (!u) return ''
  return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
})
const userNickname = computed(() => auth.displayName || '')

const STORAGE_KEY = 'xiaomu_history_v1'
const MAX_HISTORY = 12

const input = ref('')
const sending = ref(false)
const messages = reactive(loadHistory())
const scrollEl = ref(null)
const inputEl = ref(null)
const emotionLabel = ref('')
const emotionEmoji = ref('')
const greeting = ref('')
const GREETING_KEY = 'xiaomu_greeting_date'
let controller = null

// —— 陪伴深度：引导模块 ——
const MOODS = [
  { key: 'anxious', label: '焦虑', emoji: '😟' },
  { key: 'low', label: '低落', emoji: '🌧️' },
  { key: 'angry', label: '愤怒', emoji: '😣' },
  { key: 'lost', label: '迷茫', emoji: '🌫️' },
  { key: 'calm', label: '平静', emoji: '🍃' },
  { key: 'grateful', label: '温暖', emoji: '🌤️' },
]
const guides = [
  { key: 'mood', emoji: '🌤️', label: '此刻心情', desc: '点一个情绪，小木来接住你，并可记入今天的心情' },
  { key: 'recap', emoji: '📊', label: '本周复盘', desc: '基于近7天心情，小木陪你回顾这一周' },
  { key: 'cbt', emoji: '🧠', label: '换个角度看', desc: 'CBT思维记录，和小木一起做认知重构' },
  { key: 'bedtime', emoji: '🌙', label: '睡前一刻', desc: '入睡前的小小收尾仪式' },
  { key: 'cbt-history', emoji: '📖', label: '我的思录', desc: '回看过去的思维记录' },
]
const guide = ref('')
const pickedEmotion = ref('')
const moodTip = ref('')
const moodLogging = ref(false)
const cbt = reactive({ situation: '', thought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', alternative: '' })
const cbtLoading = ref(false)
const bedtime = reactive({ gratitude: ['', '', ''] })
const moodNote = ref('')
const cbtHistory = ref([])
const showGuidesHint = ref(false)
const CBT_STORE_KEY = 'cbt_records_v1'

const moodLabelOf = (k) => (MOODS.find((m) => m.key === k)?.label) || k
const trendChipClass = (t) => (t === 'low' ? 'bg-[#fdecea] text-[#c0654a]' : t === 'bright' ? 'bg-[#e8f5ec] text-[#4a8a5e]' : 'bg-[#eef2f7] text-[#7a8a9a]')

function loadCbtRecords() {
  try {
    const arr = JSON.parse(localStorage.getItem(CBT_STORE_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function saveCbtRecord(record) {
  try {
    const arr = loadCbtRecords()
    arr.unshift(record)
    localStorage.setItem(CBT_STORE_KEY, JSON.stringify(arr.slice(0, 50)))
  } catch {
    /* 忽略 */
  }
}
function deleteCbtRecord(idx) {
  const arr = loadCbtRecords()
  arr.splice(idx, 1)
  try { localStorage.setItem(CBT_STORE_KEY, JSON.stringify(arr)) } catch {}
  cbtHistory.value = arr
}
function fmtCbtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function dismissGuidesHint() {
  showGuidesHint.value = false
  try { localStorage.setItem('companion_guides_hint', '1') } catch {}
}

function openGuide(key) {
  if (key === 'recap') {
    guide.value = ''
    loadRecap()
    return
  }
  if (key === 'cbt-history') {
    cbtHistory.value = loadCbtRecords()
  }
  guide.value = guide.value === key ? '' : key
}

// 情绪命名：点亮情绪 + 以「我感到{label}」触发小木回应
async function pickEmotion(m) {
  pickedEmotion.value = m.key
  emotionLabel.value = m.label
  emotionEmoji.value = m.emoji
  moodTip.value = ''
  await sendText(`我感到${m.label}`)
}

// 记入今天的心情 + 打卡（与 Mood.vue 一致）
async function logMood() {
  if (!userId.value) {
    moodTip.value = '请先登录后再记录'
    return
  }
  if (!pickedEmotion.value) return
  moodLogging.value = true
  moodTip.value = ''
  const res = await moodApi.add(userId.value, pickedEmotion.value, moodNote.value.trim())
  moodLogging.value = false
  if (res.ok) {
    moodTip.value = '已记入今天的心情 + 打卡 ✓'
    moodNote.value = ''
    checkinsApi.checkin({ userId: userId.value, source: 'mood' }).catch(() => {})
    badgesStore.refresh(userId.value).catch(() => {})
  } else {
    moodTip.value = res.reason || '记录失败，稍后再试'
  }
}

// 以打字机方式追加一条小木气泡（用于复盘 / CBT / 睡间的非流式结果）
async function pushAssistant(text) {
  sending.value = true
  activeAssistant = reactive({ role: 'assistant', content: '', thinking: true })
  messages.push(activeAssistant)
  await scrollToBottom()
  activeAssistant.thinking = false
  for (const ch of text) {
    activeAssistant.content += ch
    if ('，。、；：！？\n'.includes(ch)) await new Promise((r) => setTimeout(r, 40))
    scrollToBottom()
  }
  sending.value = false
  saveHistory()
}

// 本周情绪复盘（结构化卡片）
async function loadRecap() {
  if (!userId.value) {
    await pushAssistant('先登录后，小木才能陪你看看这一周的心情～')
    return
  }
  const data = await companionApi.getRecap(userId.value)
  if (!data.ok) {
    await pushAssistant('小木暂时没能调出记录，稍后再试试。')
    return
  }
  if (data.empty || !data.recap) {
    await pushAssistant('这几天还没有心情记录呢。先去「心情日记」留几笔，小木才能陪你复盘～')
    return
  }
  messages.push({ role: 'assistant', type: 'recap', recap: data.recap })
  await scrollToBottom()
  saveHistory()
}

// CBT 思维记录提交
async function submitCbtForm() {
  if (!cbt.thought.trim()) return
  guide.value = ''
  cbtLoading.value = true
  await pushAssistant('你愿意把这件心事摊开来看，已经很勇敢了。我慢慢读……')
  const data = await companionApi.submitCbt({
    situation: cbt.situation,
    thought: cbt.thought,
    emotion: cbt.emotion,
    evidenceFor: cbt.evidenceFor,
    evidenceAgainst: cbt.evidenceAgainst,
    alternative: cbt.alternative,
  })
  cbtLoading.value = false
  const rec = { situation: cbt.situation, thought: cbt.thought, emotion: cbt.emotion, evidenceFor: cbt.evidenceFor, evidenceAgainst: cbt.evidenceAgainst, alternative: cbt.alternative }
  Object.assign(cbt, { situation: '', thought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', alternative: '' })
  if (data.ok && data.suggestion) {
    saveCbtRecord({ ...rec, suggestion: data.suggestion, at: new Date().toISOString() })
    badgesStore.refresh(userId.value).catch(() => {})
    await pushAssistant(data.suggestion)
  } else {
    await pushAssistant('小木暂时走神了，稍后再陪你看看好吗？')
  }
}

// 睡前仪式完成
async function finishBedtime() {
  guide.value = ''
  localStorage.setItem('bedtime_done_v1', '1')
  if (userId.value) checkinsApi.checkin({ userId: userId.value, source: 'practice' }).catch(() => {})
  badgesStore.refresh(userId.value).catch(() => {})
  const g = bedtime.gratitude.map((x) => x.trim()).filter(Boolean)
  let line = '晚安。今天你为自己留出了这一刻安静，已经很了不起了。'
  if (g.length) line += `\n你记下的${g.length}件小确幸——${g.join('、')}——就让它们陪你入梦吧。`
  line += '\n慢慢呼吸，把一天的重量轻轻放下。我在这里，明天见。🌙'
  bedtime.gratitude = ['', '', '']
  await pushAssistant(line)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
// 仅在「当天首次访问」拉取一次陪伴语，避免每次进页面都打扰
async function loadGreeting() {
  if (!userId.value) return
  try {
    if (localStorage.getItem(GREETING_KEY) === todayKey()) return
    const data = await companionApi.getGreeting(userId.value)
    if (data?.ok && data.greeting) {
      greeting.value = data.greeting
      localStorage.setItem(GREETING_KEY, todayKey())
    }
  } catch {
    /* 忽略：陪伴语是锦上添花，失败不影响主流程 */
  }
}
function dismissGreeting() {
  greeting.value = ''
}

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
    // 仅持久化已完成（非 thinking）的消息；保留复盘卡片的结构化数据
    const toSave = messages
      .filter((m) => !m.thinking)
      .map((m) => {
        const o = { role: m.role, content: m.content || '' }
        if (m.type) o.type = m.type
        if (m.type === 'recap' && m.recap) o.recap = m.recap
        return o
      })
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
  // 同步清空服务端记忆（若已登录且启用）
  if (userId.value) companionApi.clearHistory(userId.value)
}

function getHistory() {
  // 取最近若干条已完成消息作为上下文（复盘卡片以其文字摘要参与上下文）
  return messages
    .filter((m) => !m.thinking)
    .map((m) => ({ role: m.role, content: m.type === 'recap' ? (m.recap?.text || '') : m.content }))
    .slice(-MAX_HISTORY)
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  await sendText(text)
}

// 以指定文本触发一次小木对话（供「情绪命名」等引导模块复用）
async function sendText(text) {
  if (!text || sending.value) return

  messages.push({ role: 'user', content: text })
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
    userId: userId.value,
    nickname: userNickname.value,
    onMeta: (meta) => {
      if (meta.emotion) {
        emotionLabel.value = meta.emotion.label || ''
        emotionEmoji.value = meta.emotion.emoji || ''
      }
      if (meta.crisis) crisisStore.open()
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

// 本地降级：与后端一致的规则，逐字模拟打字机（无需后端/key 即可对话）
function localDetect(text) {
  const crisis = detectCrisis(text)
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
  if (crisis) return crisisReply()
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
  if (crisis) crisisStore.open()
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

// 挂载时：若已登录，从服务端恢复对话（跨设备连续性）；失败则保留本地 localStorage
onMounted(async () => {
  try {
    if (!localStorage.getItem('companion_guides_hint')) showGuidesHint.value = true
  } catch {}
  if (!userId.value) return
  const serverMsgs = await companionApi.getHistory(userId.value)
  if (serverMsgs && serverMsgs.length) {
    messages.splice(0, messages.length, ...serverMsgs.map((m) => ({ role: m.role, content: m.content })))
    saveHistory()
    await scrollToBottom()
  }
  // 并行拉取当天的主动陪伴语（独立于对话恢复）
  loadGreeting()
})

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
