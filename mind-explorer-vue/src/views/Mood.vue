<template>
  <main class="max-w-3xl mx-auto px-4 py-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-[#3a4a5c] m-0">🌤️ 心情日记</h1>
      <p class="text-[#9aa6b2] text-[14px] mt-1 m-0">每天留一笔，看看自己的情绪起伏。只有你自己和小木能看到。</p>
    </header>

    <!-- 记录区 -->
    <section class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <p class="text-[14px] text-[#5a6b7c] mb-3 m-0">今天，你感觉……</p>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        <button
          v-for="m in MOODS"
          :key="m.key"
          @click="pick(m.key)"
          class="flex flex-col items-center gap-1 py-3 rounded-xl border transition"
          :class="selected === m.key ? 'border-[#7c9cb8] bg-[#f0f4f9] scale-[1.03]' : 'border-[#eef2f7] hover:border-[#c5d8ea]'"
        >
          <span class="text-[26px] leading-none">{{ m.emoji }}</span>
          <span class="text-[12px] text-[#5a6b7c]">{{ m.label }}</span>
        </button>
      </div>
      <textarea
        v-model="note"
        rows="2"
        placeholder="想多说一点吗？（可选）"
        class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] resize-none focus:outline-none focus:border-[#7c9cb8] mb-3"
      ></textarea>
      <div class="flex items-center justify-between">
        <span class="text-[12px] text-[#9aa6b2]">{{ savedTip }}</span>
        <button
          @click="save"
          :disabled="!selected || saving"
          class="px-5 py-2 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-xl text-[14px] font-semibold disabled:opacity-50 transition hover:opacity-90"
        >
          {{ saving ? '保存中…' : '保存今天的心情' }}
        </button>
      </div>
    </section>

    <!-- 情绪曲线 -->
    <section class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">近 14 天情绪曲线</h2>
      <div v-if="entries.length" v-html="chartSvg" class="w-full"></div>
      <p v-else class="text-[13px] text-[#9aa6b2] py-6 text-center m-0">还没有记录，保存第一条心情后这里会出现你的曲线～</p>
    </section>

    <!-- 近期记录 -->
    <section class="bg-white rounded-2xl border border-[#eef2f7] p-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">近期记录</h2>
      <ul v-if="recent.length" class="space-y-2">
        <li v-for="(e, i) in recent" :key="i" class="flex items-start gap-2 text-[14px]">
          <span class="text-[18px] shrink-0">{{ moodEmoji(e.emotion) }}</span>
          <div>
            <span class="text-[#3a4a5c]">{{ moodLabel(e.emotion) }}</span>
            <span class="text-[#9aa6b2] text-[12px] ml-2">{{ fmt(e.created_at) }}</span>
            <p v-if="e.note" class="text-[#5a6b7c] text-[13px] mt-0.5 m-0">{{ e.note }}</p>
          </div>
        </li>
      </ul>
      <p v-else class="text-[13px] text-[#9aa6b2] py-4 text-center m-0">暂无记录。点上面的情绪，留下来吧。</p>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { moodApi } from '../api/mood'
import { checkinsApi } from '../api/checkins'
import { useAuthStore } from '../stores/auth'
import { useBadgeStore } from '../stores/badges'
import { useCrisisStore } from '../stores/crisisStore'
import { detectCrisis } from '../lib/crisis'

const auth = useAuthStore()
const badgesStore = useBadgeStore()
const crisisStore = useCrisisStore()
const selected = ref('')
const note = ref('')
const saving = ref(false)
const savedTip = ref('')
const entries = ref([])

const MOODS = [
  { key: 'anxious', label: '焦虑', emoji: '😟', v: -2 },
  { key: 'low', label: '低落', emoji: '🌧️', v: -2 },
  { key: 'angry', label: '愤怒', emoji: '😣', v: -1 },
  { key: 'lost', label: '迷茫', emoji: '🌫️', v: -1 },
  { key: 'calm', label: '平静', emoji: '🍃', v: 0 },
  { key: 'grateful', label: '温暖', emoji: '🌤️', v: 2 },
]
const LABEL = Object.fromEntries(MOODS.map((m) => [m.key, m.label]))
const EMOJI = Object.fromEntries(MOODS.map((m) => [m.key, m.emoji]))
const VAL = Object.fromEntries(MOODS.map((m) => [m.key, m.v]))

const userId = computed(() => {
  const u = auth.currentUser
  if (!u) return ''
  return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
})
const moodLabel = (k) => LABEL[k] || k
const moodEmoji = (k) => EMOJI[k] || '🍃'
function fmt(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function pick(k) {
  selected.value = k
}

const recent = computed(() => entries.value.slice(-8).reverse())

// 近 14 天情绪曲线（手绘 SVG，valence ∈ [-2,2]）
const chartSvg = computed(() => {
  const days = 14
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const map = {} // dayIndex -> 当日最后一条 valence
  for (const e of entries.value) {
    const d = new Date(e.created_at)
    d.setHours(0, 0, 0, 0)
    const diff = Math.floor((today - d) / 86400000)
    if (diff >= 0 && diff < days) map[diff] = VAL[e.emotion] ?? 0
  }
  const pts = []
  for (let i = 0; i < days; i++) if (map[i] !== undefined) pts.push({ i, v: map[i] })
  if (!pts.length) return ''
  const W = 560, H = 180, pad = 26
  const x = (i) => pad + (i / (days - 1)) * (W - 2 * pad)
  const y = (v) => pad + (1 - (v + 2) / 4) * (H - 2 * pad)
  const line = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const dots = pts.map((p) => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="#7c9cb8"/>`).join('')
  const grid = [
    [2, '暖'],
    [0, '平'],
    [-2, '低'],
  ]
    .map(([v, t]) => `<text x="2" y="${(y(v) + 3).toFixed(1)}" font-size="10" fill="#b9c4cf">${t}</text>`)
    .join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet"><line x1="${pad}" y1="${y(0)}" x2="${W - pad}" y2="${y(0)}" stroke="#eef2f7" stroke-width="1"/><path d="${line}" fill="none" stroke="#7c9cb8" stroke-width="2" stroke-linejoin="round"/>${dots}${grid}</svg>`
})

async function load() {
  if (!userId.value) return
  entries.value = await moodApi.list(userId.value, 30)
}
async function save() {
  if (!selected.value) {
    savedTip.value = '先选一个心情吧'
    return
  }
  if (!userId.value) {
    savedTip.value = '请先登录后再记录心情'
    return
  }
  saving.value = true
  savedTip.value = ''
  const res = await moodApi.add(userId.value, selected.value, note.value.trim())
  saving.value = false
  if (res.ok) {
    // 心情备注命中高危词 → 弹援助资源（服务端标记 or 前端即时检测，二者取一即可）
    if (res.crisis || detectCrisis(note.value)) crisisStore.open()
    savedTip.value = '已记下 ☀️'
    note.value = ''
    selected.value = ''
    await load()
    // 心情记录即打卡（优雅跳过，失败不影响主流程）
    checkinsApi.checkin({ userId: userId.value, source: 'mood' }).catch(() => {})
    // 打卡后刷新成就，若解锁新徽章则弹庆祝
    badgesStore.refresh(userId.value).catch(() => {})
  } else {
    savedTip.value = '保存失败，稍后再试'
  }
}

onMounted(load)
</script>
