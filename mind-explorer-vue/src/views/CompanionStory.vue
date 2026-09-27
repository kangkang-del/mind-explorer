<template>
  <main class="mx-auto max-w-3xl px-4 py-5">
    <!-- ── 顶栏：返回 / 区间切换 / 重播 / 导出 ── -->
    <header class="flex items-center gap-3 mb-4 shrink-0">
      <RouterLink
        to="/companion"
        class="text-[13px] text-[#7a8a9a] hover:text-[#5a6b7c] transition no-underline flex items-center gap-1 shrink-0"
      >
        <span aria-hidden="true">←</span> 回到小木
      </RouterLink>
      <h1 class="text-[17px] font-bold text-[#3a4a5c] m-0 flex-1 truncate">📖 小木记得的你</h1>
      <button
        v-if="phase !== 'loading'"
        type="button"
        class="text-[12px] px-2.5 py-1 rounded-full border border-[#e0e6ec] text-[#7a8a9a] hover:border-[#c5d8ea] hover:text-[#5a7d9a] transition shrink-0"
        @click="replay"
      >
        {{ narrating ? '跳过' : '重播' }}
      </button>
    </header>

    <!-- ── 区间切换（O3：全部 / 近 30 天） ── -->
    <div v-if="phase !== 'loading'" class="flex items-center gap-2 mb-4 flex-wrap shrink-0">
      <button
        v-for="o in RANGES" :key="o.days" type="button"
        class="text-[12px] px-3 py-1 rounded-full border transition"
        :class="days === o.days
          ? 'bg-[#7c9cb8] border-[#7c9cb8] text-white'
          : 'bg-white border-[#eef2f7] text-[#7a8a9a] hover:border-[#c5d8ea]'"
        @click="setRange(o.days)"
      >{{ o.label }}</button>
      <span class="ml-auto text-[11px] text-[#b8c2cc]">{{ rangeHint }}</span>
    </div>

    <!-- ── 讲故事舞台 ── -->
    <section
      ref="stageEl"
      class="relative rounded-3xl border border-[#eef2f7] bg-gradient-to-b from-[#fbfdfb] to-[#f7faf8] px-5 pt-5 pb-8 min-h-[380px]"
    >
      <!-- 加载中 -->
      <div v-if="phase === 'loading'" class="py-16 text-center">
        <div class="mx-auto mb-4 xm-story-pet">
          <XiaomuSvg state="think" :micro="{ eyesClosed: true }" variant="wood" :wear="wear" />
        </div>
        <p class="text-[13.5px] text-[#9aa6b2] m-0">小木正在翻它的记事本…</p>
      </div>

      <!-- 读不到（未登录 / 后端未部署 / 网络失败） -->
      <div v-else-if="phase === 'blocked'" class="py-12 text-center">
        <div class="mx-auto mb-4 xm-story-pet">
          <XiaomuSvg state="idle" :micro="{ earDroop: true }" variant="wood" :wear="wear" />
        </div>
        <p class="text-[14px] text-[#5a6b7c] m-0 mb-2">{{ blockedText }}</p>
        <RouterLink
          v-if="!isLoggedIn"
          to="/companion"
          class="inline-block mt-2 text-[13px] px-4 py-1.5 rounded-full bg-[#7c9cb8] text-white no-underline hover:opacity-90 transition"
        >回去登录</RouterLink>
      </div>

      <!-- 空态（登录了但确实还没有记忆） -->
      <div v-else-if="phase === 'empty'" class="py-12 text-center">
        <div class="mx-auto mb-4 xm-story-pet">
          <XiaomuSvg state="idle" :action="'swayLeaf'" variant="wood" :wear="wear" />
        </div>
        <p class="text-[14.5px] text-[#5a6b7c] leading-7 m-0 mb-1">我还记得的，是空白的。</p>
        <p class="text-[13px] text-[#9aa6b2] leading-7 m-0">
          去和我聊几句吧，或者记一笔今天的心情 —— 下次来，这里就会有你我的故事了 🌱
        </p>
      </div>

      <!-- 叙事中 -->
      <template v-else>
        <!-- 小木在场：会随叙事节奏切换状态 -->
        <div class="flex justify-center mb-4">
          <div class="xm-story-pet" :class="{ 'is-speaking': narrating }">
            <XiaomuSvg :state="petState" :action="petAction" :micro="petMicro" variant="wood" :wear="wear" />
          </div>
        </div>

        <!-- 已讲出的段落 -->
        <div class="space-y-4">
          <TransitionGroup name="xm-line">
            <article
              v-for="seg in spoken" :key="seg.key"
              class="xm-seg"
              :class="`is-${seg.kind}`"
            >
              <!-- 小木旁白 -->
              <p v-if="seg.kind === 'narrate'" class="text-[14px] text-[#5a6b7c] leading-7 m-0">
                <span class="text-[15px] mr-1.5" aria-hidden="true">🌿</span>{{ seg.text }}
              </p>

              <!-- 章节标题 -->
              <h2 v-else-if="seg.kind === 'chapter'" class="text-[15px] font-bold text-[#3a4a5c] m-0 flex items-center gap-2">
                <span aria-hidden="true">{{ seg.emoji }}</span>{{ seg.text }}
                <span class="flex-1 h-[1px] bg-[#e6efe9]"></span>
              </h2>

              <!-- 画像条目（key-value） -->
              <div v-else-if="seg.kind === 'fact'" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
                <span class="text-[#9aa6b2]">{{ seg.label }}</span>
                <span class="text-[#3a4a5c]">{{ seg.value }}</span>
              </div>

              <!-- 情绪柱（时间线） -->
              <div v-else-if="seg.kind === 'moods'" class="flex items-end gap-[3px] h-[64px] px-1">
                <span
                  v-for="(m, i) in seg.items" :key="i"
                  class="xm-bar flex-1 min-w-[4px] rounded-t-[3px] relative group"
                  :style="{ height: m.h + '%', backgroundColor: m.color }"
                  :title="m.title"
                ><span class="xm-bar-tip">{{ m.title }}</span></span>
              </div>

              <!-- 关键片段（对话摘录，已截断） -->
              <div v-else-if="seg.kind === 'moment'" class="flex gap-2.5" :class="seg.role === 'user' ? 'flex-row-reverse' : ''">
                <div
                  class="max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-6 whitespace-pre-wrap break-words"
                  :class="seg.role === 'user'
                    ? 'bg-[#eef4f9] text-[#4a6a8a] rounded-br-sm'
                    : 'bg-white border border-[#e6efe9] text-[#3a4a5c] rounded-bl-sm'"
                >
                  <span class="block text-[10.5px] text-[#b8c2cc] mb-0.5">
                    {{ seg.role === 'user' ? '你' : '小木' }} · {{ seg.time }}
                  </span>
                  {{ seg.text }}<span v-if="seg.clipped" class="text-[#b8c2cc]">…</span>
                </div>
              </div>

              <!-- 结尾 -->
              <p v-else-if="seg.kind === 'ending'" class="text-[14px] text-[#5a8a6a] leading-7 m-0 text-center">
                {{ seg.text }}
              </p>
            </article>
          </TransitionGroup>
        </div>

        <!-- 讲完了 -->
        <Transition name="xm-line">
          <div v-if="!narrating" class="mt-6 pt-5 border-t border-dashed border-[#e6efe9]">
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="text-[13px] px-4 py-2 rounded-full bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white font-semibold hover:opacity-90 transition"
                @click="exportStorybook"
              >
                📖 把这段做成故事书
              </button>
              <button
                type="button"
                class="text-[13px] px-4 py-2 rounded-full border border-[#e0e6ec] text-[#5a6b7c] hover:border-[#c5d8ea] transition"
                @click="replay"
              >再讲一遍</button>
            </div>
            <p class="text-[11.5px] text-[#b8c2cc] leading-5 mt-2.5 m-0">
              {{ exportHint }}
            </p>
          </div>
        </Transition>
      </template>
    </section>

    <!-- 底部：叙事控制（旁白开关 / 语速） -->
    <div v-if="phase === 'ready'" class="flex items-center gap-3 mt-3 text-[11.5px] text-[#9aa6b2]">
      <label class="flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" v-model="voiceOn" class="accent-[#7c9cb8]" />
        小木念旁白
      </label>
      <span class="text-[#e0e6ec]">|</span>
      <label class="flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" v-model="narrateMoments" class="accent-[#7c9cb8]" />
        念出对话片段
      </label>
      <span class="ml-auto">{{ totalLines }} 段</span>
    </div>
  </main>
</template>

<script setup>
/**
 * CompanionStory —— 「小木记得的你」故事书（M4 批次 O）
 *
 * 定位：/companion 的子页（不是独立导航），从同行者页的「故事书」入口进来。
 *
 * ── 为什么是「动态叙事」而不是静态三块 ──────────────────────────
 * 数据本来是三块死列表（画像 / 情绪时间线 / 关键片段）。但这一页讲的不是报表，
 * 是「小木记得你什么」——所以把它做成**小木一段一段讲出来**：
 *   ① 段落按脚本顺序逐条登场（淡入 + 轻微上浮），有节奏停顿，像讲故事不像刷列表；
 *   ② 小木本人在场，随段落类型切换状态（开场 swayLeaf 摇叶子、讲片段时 talk、
 *      说心情时 think），并可选「念旁白」逐字打出；
 *   ③ 随时可跳过 / 重播，语速与旁白可开关 —— 尊重用户，不做不可打断的演出。
 *
 * ── 隐私红线（任务清单 O1 明确要求） ─────────────────────────────
 * 关键片段是**服务端已截断**的（用户侧 ≤48 字 / 小木侧 ≤64 字）。前端只做展示，
 * 绝不回表取原文、绝不把截断前的文本拼回来。verdict：这里没有任何「完整原文」。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import XiaomuSvg from '../companion/components/XiaomuSvg.vue'
import { companionApi } from '../api/companion'
import { useIdentity } from '../composables/useIdentity'
import { useXiaomuPrefs } from '../companion/composables/useXiaomuPrefs'
import { buildStorybookHtml, storybookFilename, buildNarrative } from '../companion/core/storybook'

const RANGES = [
  { days: 0, label: '全部' },
  { days: 30, label: '近 30 天' },
]

const route = useRoute()
const ident = useIdentity()
const prefs = useXiaomuPrefs()

const wear = computed(() => prefs.wear || { hat: 'hat-none', scarf: 'scarf-none', bow: 'bow-none' })
const isLoggedIn = computed(() => !!ident.userId.value)

const phase = ref('loading')       // loading | blocked | empty | ready
const blockedText = ref('')
const days = ref(0)
const data = ref(null)

/* ---- 叙事状态 ---- */
const spoken = ref([])             // 已讲出的段落
const narrating = ref(false)       // 是否正在讲
const voiceOn = ref(true)          // 小木念旁白（打字机）
const narrateMoments = ref(false)  // 是否逐字念对话片段（默认关：片段本身是「引用」，读了像复述）
const petState = ref('idle')
const petAction = ref(null)
const petMicro = ref({})

let timers = []
let runId = 0                      // 每次重播 +1，旧循环检测到不一致立刻退出

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}
function wait(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    timers.push(t)
  })
}

/* ================= 脚本生成：把数据编成一段可讲的叙事 =================
 * buildNarrative / moodBars / fmtMoment 都在 core/storybook.js（纯模块），
 * 与导出器同源 —— 页面怎么演、导出的文件怎么排，用的是同一份段落数据。 */

/* ================= 播放：把脚本一段一段讲出来 ================= */

const SPEED = { narrate: 900, chapter: 1100, fact: 500, moods: 1000, moment: 700, ending: 1200 }

async function play(segs) {
  const myRun = ++runId
  narrating.value = true
  spoken.value = []
  petState.value = 'idle'
  petAction.value = 'swayLeaf'
  petMicro.value = {}

  await wait(500)   // 开场前的静默，像小木在整理思路

  for (const seg of segs) {
    if (myRun !== runId) return

    // 小木随段落类型换状态（让「在场感」成立）
    if (seg.kind === 'chapter') { petAction.value = 'swayLeaf'; petState.value = 'idle' }
    else if (seg.kind === 'moment') { petState.value = 'talk'; petAction.value = null }
    else if (seg.kind === 'moods') { petState.value = 'think'; petAction.value = null; petMicro.value = { eyesClosed: true } }
    else if (seg.kind === 'ending') { petState.value = 'happy'; petAction.value = 'jumpJoy' }
    else { petState.value = 'talk'; petAction.value = null }

    // 旁白逐字打出（voiceOn 关闭时直接整段呈现）
    const shouldType = voiceOn.value && seg.kind !== 'moods' && seg.kind !== 'fact'
      && (seg.kind !== 'moment' || narrateMoments.value)
    if (shouldType && seg.text) {
      spoken.value.push({ ...seg, key: `${myRun}-${spoken.value.length}`, text: '' })
      const idx = spoken.value.length - 1
      const target = seg.text
      // 每帧 1~2 字：长文本自动加快，避免 300 字段落讲 30 秒
      const chunk = target.length > 120 ? 3 : target.length > 60 ? 2 : 1
      for (let i = 0; i < target.length; i += chunk) {
        if (myRun !== runId) return
        spoken.value[idx] = { ...spoken.value[idx], text: target.slice(0, i + chunk) }
        await wait(target[i] === '。' || target[i] === '，' ? 90 : 26)
      }
      spoken.value[idx] = { ...spoken.value[idx], text: target }
    } else {
      spoken.value.push({ ...seg, key: `${myRun}-${spoken.value.length}` })
    }

    await wait(SPEED[seg.kind] ?? 600)
  }

  if (myRun !== runId) return
  narrating.value = false
  petState.value = 'idle'
  petAction.value = 'swayLeaf'
  petMicro.value = {}
  await scrollStageToBottom()
}

function replay() {
  if (narrating.value) {
    runId++            // 跳过：让当前循环失效
    clearTimers()
    narrating.value = false
    // 跳过 = 一次性把全部段落呈现出来
    spoken.value = (storySegs.value || []).map((s, i) => ({ ...s, key: `skip-${i}` }))
    petState.value = 'idle'
    petAction.value = 'swayLeaf'
    petMicro.value = {}
    return
  }
  play(storySegs.value || [])
}

const storySegs = computed(() => (data.value ? buildNarrative(data.value) : []))

/* ================= 数据加载 ================= */

async function load(d) {
  phase.value = 'loading'
  data.value = null
  const uid = ident.userId.value
  if (!uid) {
    phase.value = 'blocked'
    blockedText.value = '我还没法把记得的事讲给你听 —— 先登录一下，我们的故事才有地方存着。'
    return
  }
  const token = await ident.ensureToken()
  const res = await companionApi.getMemoryOverview(uid, token || ident.token(), d)
  if (!res.ok) {
    phase.value = 'blocked'
    blockedText.value = res.reason === 'forbidden'
      ? '登录状态好像过期了，重新登录一次，我就想起来了。'
      : '我暂时翻不到记事本（网络或服务不可用），过一会儿再来看看？'
    return
  }
  if (!res.exists) {
    phase.value = 'empty'
    return
  }
  data.value = res
  phase.value = 'ready'
  play(storySegs.value)
}

function setRange(d) {
  if (days.value === d) return
  days.value = d
  runId++
  clearTimers()
  spoken.value = []
  narrating.value = false
  load(d)
}

/* ================= 导出故事书（O2/O3） ================= */

const exportHint = computed(() => {
  if (!data.value) return ''
  const n = data.value.stats?.momentCount || 0
  const m = data.value.stats?.moodCount || 0
  return `导出一个可离线打开的单文件 HTML —— 含 ${m} 条心情、${n} 段对话片段，不含任何外部依赖。`
})

function exportStorybook() {
  if (!data.value) return
  const html = buildStorybookHtml({
    profile: data.value.profile,
    moods: data.value.moods,
    moments: data.value.moments,
    stats: data.value.stats,
    days: data.value.days,
    exportedAt: new Date(),
    isGuest: ident.isQuickGuest.value,
  })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = storybookFilename(new Date())
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ================= 滚动 / 生命周期 ================= */

const stageEl = ref(null)
async function scrollStageToBottom() {
  // 只滚页面（不滚 stage 内部），让新段落进入视野
  const el = stageEl.value
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'end' })
}

const totalLines = computed(() => (storySegs.value || []).length)

/** 区间提示：告诉用户「这段时间里我记下了多少」，把筛选结果说清楚 */
const rangeHint = computed(() => {
  if (phase.value !== 'ready' || !data.value) return ''
  const s = data.value.stats || {}
  const scope = days.value === 30 ? '近 30 天' : '全部时间'
  return `${scope} · ${s.moodCount || 0} 条心情 · ${s.momentCount || 0} 段片段`
})

watch(() => ident.userId.value, () => load(days.value))

onMounted(() => {
  load(Number(route.query.days) || 0)
})

onBeforeUnmount(() => {
  runId++
  clearTimers()
})
</script>

<style scoped>
/* 舞台上小木的尺寸：比桌宠小一圈，且不参与桌宠的定位/手势 */
.xm-story-pet {
  width: 118px;
  transition: transform .4s ease;
}
.xm-story-pet.is-speaking { transform: translateY(-3px); }

/* 段落登场：淡入 + 上浮 */
.xm-line-enter-active { transition: opacity .5s ease, transform .5s ease; }
.xm-line-enter-from { opacity: 0; transform: translateY(10px); }

.xm-seg { margin: 0; }

/* 情绪柱：hover 显示日期提示 */
.xm-bar { cursor: default; transition: filter .2s ease; }
.xm-bar:hover { filter: brightness(1.08); }
.xm-bar-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 10.5px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(43, 43, 43, .88);
  color: #fff;
  opacity: 0;
  pointer-events: none;
  transition: opacity .15s ease;
}
.xm-bar:hover .xm-bar-tip { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .xm-line-enter-active { transition: none; }
  .xm-story-pet { transition: none; }
}
</style>
