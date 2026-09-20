<template>
  <div
    ref="petEl"
    class="xm-pet"
    :class="{ 'is-dragging': dragging, 'is-landing': landing, 'is-collapsed': collapsed, 'is-growing': growing }"
    :style="[posStyle, kbStyle]"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <XiaomuBubble
      v-if="!collapsed"
      ref="bubbleRef"
      :visible="bubble.visible"
      :full-text="bubble.text"
      :mode="bubble.mode"
      :chips="bubble.chips"
      @chip="onChip"
      @open-chat="chatOpen = true"
      @typed="onBubbleTyped"
    />

    <XiaomuSvg
      v-if="!collapsed"
      :state="petState"
      :action="petAction"
      :micro="petMicro"
      :variant="effVariant"
      :wear="prefs.wear"
      :skin-url="skin.url.value"
    />

    <!-- 收起态：一颗会呼吸的小嫩芽，点一下长回小木 -->
    <XiaomuSprout v-else @wake="wake" />

    <!-- 历史小抽屉（长按气泡呼出，最近 5 条） -->
    <Transition name="xm-drawer">
      <div v-if="historyOpen" class="xm-history" @pointerdown.stop @click.stop>
        <div class="xm-history-title">最近聊过的</div>
        <p v-for="(m, i) in history.slice(-5)" :key="i" :class="{ 'is-user': m.role === 'user' }">
          {{ m.text }}
        </p>
        <p v-if="!history.length" class="xm-history-empty">还没聊过天，点我上面的气泡开始吧。</p>
      </div>
    </Transition>

    <!-- 换装面板（M3 批次 I：chips「换一身」呼出） -->
    <XiaomuWardrobe :open="wardrobeOpen" @close="wardrobeOpen = false" />

    <!-- 迷你输入条 -->
    <Transition name="xm-drawer">
      <div v-if="chatOpen" class="xm-chat-tools" @pointerdown.stop @click.stop>
        <RouterLink to="/companion">打开完整对话页 ↗</RouterLink>
        <button
          type="button"
          class="xm-dnd"
          :class="{ 'is-on': prefs.dnd }"
          :title="prefs.dnd ? '免打扰已开：小木不主动搭话（点此关闭）' : '免打扰：让小木别主动找你'"
          :aria-label="prefs.dnd ? '关闭免打扰' : '开启免打扰'"
          @click="prefs.dnd = !prefs.dnd"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            <line v-if="prefs.dnd" x1="3" y1="3" x2="21" y2="21" />
          </svg>
        </button>
      </div>
    </Transition>
    <Transition name="xm-drawer">
      <div v-if="chatOpen" ref="inputBar" class="xm-mini-input" :style="inputShift ? { transform: `translate(calc(-50% + ${inputShift}px), 0)` } : {}" @pointerdown.stop>
        <input
          ref="inputEl"
          v-model="draft"
          type="text"
          placeholder="和小木说点什么…"
          maxlength="200"
          @keydown.enter="send"
        />
        <button type="button" @click="send">发送</button>
        <button type="button" class="xm-close" aria-label="收起输入" @click="chatOpen = false">×</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
/**
 * XiaomuPet —— 悬浮容器 + 手势物理（M1 任务 4）
 *
 * 手势判定（pointer 统一鼠标/触摸）：
 *   位移 > 8px            → 拖拽（state='drag'，四肢下垂摆动；松手落回弹 + 保存位置）
 *   长按 500ms 未拖       → 摸头（headPat hold 型，pointerup 释放；仅头部区域触发）
 *   单击（位移小、时长短）→ surprise 惊讶回看 + 气泡交互
 *   350ms 内第二次单击    → jumpJoy 小跳 + 爱心
 *
 * 聊天流：真实流式（useChat → Edge Function companion，SSE 逐字上屏）。
 * 建议拖到右下角拇指热区；位置/形态/换装自动持久化。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import XiaomuSvg from './XiaomuSvg.vue'
import XiaomuBubble from './XiaomuBubble.vue'
import XiaomuSprout from './XiaomuSprout.vue'
import XiaomuWardrobe from './XiaomuWardrobe.vue'
import { useXiaomuState } from '../composables/useXiaomuState'
import { useXiaomuPrefs } from '../composables/useXiaomuPrefs'
import { useXiaomuChat } from '../composables/useChat'
import { useXiaomuMind } from '../composables/useXiaomuMind'
import { useXiaomuProactive } from '../composables/useXiaomuProactive'
import { useXiaomuWardrobe } from '../composables/useXiaomuWardrobe'
import { useXiaomuSkin } from '../composables/useXiaomuSkin'
import { useAuthStore } from '../../stores/auth'
import { ACTION } from '../core/actions'
import { itemOf } from '../core/wardrobe'

const petEl = ref(null)
const inputEl = ref(null)

const prefs = useXiaomuPrefs()
const skin = useXiaomuSkin()
skin.load()   // 批次 J：首读 IndexedDB 恢复上次上传的自定义形象（幂等；隐私模式静默降级）

/** 渲染形态（批次 J）：选中 custom 但本机还没有图片时回落木灵，避免出现空白形象 */
const effVariant = computed(() =>
  prefs.variant === 'custom' && !skin.hasSkin.value ? 'wood' : prefs.variant
)

const mind = useXiaomuMind()
const sm = useXiaomuState({
  onActionFx: null,
  // M2 mood 档位钩子：基线微表情重绘 + idle 池权重调制（见 useXiaomuMind）
  baselineMicros: () => mind.baselineMicros(),
  idleWeightMod: (name, w) => mind.idleWeightMod(name, w),
})
const chat = useXiaomuChat()
const petState = sm.state
const petAction = sm.action
const petMicro = sm.micro

/* 收起 / 唤出（任务 7） */
const collapsed = computed(() => prefs.collapsed)
const growing = ref(false)          // 入场/长出动画进行中
const collapseAnchor = ref(null)    // 收起后小嫩芽位置（对齐原小木脚下，本次会话内有效）

/* ================= 位置与拖拽 ================= */

const dragging = ref(false)
const landing = ref(false)

const posStyle = computed(() => {
  if (collapsed.value && collapseAnchor.value) {
    return { left: collapseAnchor.value.x + 'px', top: collapseAnchor.value.y + 'px', bottom: 'auto', right: 'auto' }
  }
  if (prefs.pos) {
    return { left: prefs.pos.x + 'px', top: prefs.pos.y + 'px', bottom: 'auto', right: 'auto' }
  }
  return {}
})

let dragStart = null   // { px, py, ox, oy }（指针起点 / 容器当前左上）
let moved = false

function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return
  if (collapsed.value) return   // 收起态：嫩芽只响应点击唤醒，不可拖拽
  try { petEl.value.setPointerCapture(e.pointerId) } catch { /* 合成事件 / 指针已释放：不影响点击判定 */ }
  const rect = petEl.value.getBoundingClientRect()
  dragStart = { px: e.clientX, py: e.clientY, ox: rect.left, oy: rect.top, t: Date.now() }
  moved = false
  // 头部区域长按 → 摸头（上部 55%）
  if (e.clientY - rect.top < rect.height * 0.55) {
    longTimer = setTimeout(() => {
      if (!moved && !dragging.value) {
        sm.playAction(ACTION.HEAD_PAT)   // hold 型
        mind.noteHeadPat()               // M2：被安慰 +3（60s 冷却在 mind 内）
        wardrobe.noteHeadPat()           // M3：「摸头之谊」里程碑计数（20 次解锁星星结）
        longHeld = true
      }
    }, 500)
  }
}

function onMove(e) {
  if (!dragStart) return
  const dx = e.clientX - dragStart.px
  const dy = e.clientY - dragStart.py
  if (!moved && Math.hypot(dx, dy) > 8) {
    if (longHeld) { sm.releaseAction(); longHeld = false }  // 摸头中被拖走 → 释放
    clearTimeout(longTimer)
    moved = true
    if (!prefs.pos) {                                       // 首次拖拽：把默认右下角换算成坐标
      const r = petEl.value.getBoundingClientRect()
      prefs.pos = { x: r.left, y: r.top }
    }
    dragging.value = true
    sm.setState('drag')
  }
  if (dragging.value) {
    const r = petEl.value.getBoundingClientRect()
    prefs.pos = {
      x: clamp(dragStart.ox + dx, 4, innerWidth - r.width - 4),
      y: clamp(dragStart.oy + dy, 4, innerHeight - r.height - 4),
    }
  }
}

function onUp() {
  clearTimeout(longTimer)
  if (longHeld) {                       // 摸头结束
    sm.releaseAction()
    longHeld = false
    dragStart = null
    return
  }
  if (dragging.value) {                 // 拖拽结束：落回弹
    dragging.value = false
    landing.value = true
    setTimeout(() => { landing.value = false }, 420)
    sm.setState('idle')
    dragStart = null
    return
  }
  if (dragStart && !moved) {            // 有效点击
    const dt = Date.now() - dragStart.t
    if (dt < 600) onTap()
  }
  dragStart = null
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

/* ================= 点击手势 ================= */

let lastTap = 0

function onTap() {
  const now = Date.now()
  const isDouble = now - lastTap < 350
  lastTap = now
  if (isDouble) {
    sm.playAction(ACTION.JUMP_JOY)      // 覆盖第一次的 surprise，动作轨自动接管
  } else {
    sm.playAction(ACTION.SURPRISE)
    openBubble(greetingLine(), { withChips: true })
  }
}

/* ================= 气泡与聊天流（真实流式：useChat → Edge Function companion） ================= */

const bubble = reactive({ visible: false, text: '', mode: 'xomu', chips: null })
const bubbleRef = ref(null)
const chatOpen = ref(false)
const historyOpen = ref(false)
const draft = ref('')
const history = ref([])   // { role: 'user'|'xomu', text }
let bubbleFallback = null // 打字机结束后气泡常驻兜底回收

const GREETINGS = [
  '今天也来看看我呀？',
  '嗨，我在的。心里感觉怎么样？',
  '你来了。今天有什么想说的吗？',
]

const CHIP_FACT = { key: 'fact', label: '讲个心理学小知识' }
const CHIP_WARDROBE = { key: 'wardrobe', label: '换一身' }
const CHIP_REST = { key: 'rest', label: '休息' }
const SORRY_LINES = [
  '刚才走神了，再说一遍好不好？',
  '唔……我这边愣了一下，可以再说一次吗？',
]

function greetingLine() { return GREETINGS[Math.floor(Math.random() * GREETINGS.length)] }

/* ---- M2 情绪标签演绎表（批次 E）：meta.emotion → 即时表演 ----
 * 动作自带的 micro 由 playAction 播（如 apologetic 的 earDroop）；
 * 补充 micro 显式给有限时长，避免误写常驻（earDroop/blush 默认 duration=0）。 */
const EMOTION_SHOWS = {
  low:      { action: ACTION.APOLOGETIC },                                  // 拘谨陪在旁边
  anxious:  { action: ACTION.LEAN_IN, micros: [['eyesWide', 1500]] },       // 凑近关切
  angry:    { action: ACTION.LEAN_IN, micros: [['earDroop', 2200]] },       // 紧张关心
  lost:     { action: ACTION.SCRATCH_HEAD },                                // 挠头共感
  grateful: { action: ACTION.JUMP_JOY, micros: [['blush', 2400]] },         // 被感谢很开心
  calm:     null,                                                           // 平静即日常
}

function openBubble(text, { mode = 'xomu', withChips = false } = {}) {
  bubble.visible = true
  bubble.mode = mode
  bubble.text = text
  bubble.chips = withChips ? [CHIP_FACT, CHIP_WARDROBE, CHIP_REST] : null
  clearTimeout(bubbleFallback)
  bubbleFallback = setTimeout(() => { if (!chatOpen.value) bubble.visible = false }, 14000)
}

function onBubbleTyped() {
  if (bubble.mode !== 'xomu') return
  sm.setState('idle')
  // 回复完毕随机小反应：满足闭眼歪头 or 开心小跳
  if (Math.random() < 0.3) {
    sm.setState('happy')
    setTimeout(() => { if (sm.state === 'happy') sm.setState('idle') }, 1800)
  } else {
    sm.playAction(ACTION.SWAY_LEAF)
  }
  // 长回复的流式打字可能远超 14s 兜底：打字完成后再给一轮阅读时间，避免打到一半气泡消失
  clearTimeout(bubbleFallback)
  bubbleFallback = setTimeout(() => { if (!chatOpen.value) bubble.visible = false }, 14000)
}

function onChip(chip) {
  if (chip.key === 'fact') send(chip.label)
  else if (chip.key === 'wardrobe') openWardrobe()
  else if (chip.key === 'rest') collapse()
}

/* ---- M3 批次 I：换装面板开关（与气泡/聊天互斥） ---- */
const wardrobeOpen = ref(false)

function openWardrobe() {
  bubble.visible = false
  chatOpen.value = false
  historyOpen.value = false
  wardrobeOpen.value = true
}

let busy = false

function send(text) {
  const msg = (text ?? draft.value).trim()
  if (!msg || busy || collapsed.value) return
  draft.value = ''
  busy = true
  history.value.push({ role: 'user', text: msg })
  openBubble(msg, { mode: 'user' })
  sm.setState('think')

  // 回复气泡切入流式模式：SSE 增量直接推入打字机（beginStream 后气泡 watch 被屏蔽）
  let streamBegun = false
  const beginReplyStream = () => {
    if (streamBegun) return
    streamBegun = true
    if (bubbleRef.value) bubbleRef.value.beginStream()
    bubble.mode = 'xomu'
    bubble.chips = null
    bubble.text = ''
  }

  chat.send(msg, {
    onMeta: (meta) => {
      // M2 情绪消费：meta.emotion 线上为 {key,label,emoji} 对象（实测 anxious「有些焦虑」），
      // 解析出 key 再走内心 bump 与演绎表；未知/缺失 key 静默（setFromEmotion 返回 0）。
      const emo = meta && meta.emotion
      const key = typeof emo === 'string' ? emo : (emo && emo.key) || ''
      if (mind.setFromEmotion(key)) {
        const show = EMOTION_SHOWS[key]
        if (show) {
          if (show.action) sm.playAction(show.action)
          if (show.micros) for (const [n, d] of show.micros) sm.playMicro(n, d)
        }
      }
    },
    onDelta: (chunk) => {
      if (!streamBegun) {
        beginReplyStream()
        sm.setState('talk')          // 第一个字到达 → 开口说话
      }
      if (bubbleRef.value) bubbleRef.value.pushChunk(chunk)
    },
    onDone: (full) => {
      beginReplyStream()             // 兜底：无增量直接结束时也把气泡切过来
      if (bubbleRef.value) bubbleRef.value.endStream()
      if (!full) bubble.text = '……'  // 空回复兜底（会触发整句重播，仅此一例）
      history.value.push({ role: 'xomu', text: full || '……' })
      mind.noteChatDone()            // M2：聊完一轮 +2（聊过天本身是好事）
      busy = false
      proactive.maybeFire('chat-done')   // M2 F：对话结束后给关怀触发器一次机会（低落连击≥3）
    },
    onError: (errMsg, kind) => {
      busy = false
      if (bubbleRef.value) bubbleRef.value.abortStream()
      bubble.mode = 'xomu'
      bubble.text = SORRY_LINES[Math.floor(Math.random() * SORRY_LINES.length)]
      history.value.push({ role: 'xomu', text: bubble.text })
      sm.setState('idle')
      sm.playAction(ACTION.APOLOGETIC)   // 拘谨抱歉 + 耳朵/叶芽蔫
      console.warn('[xiaomu] companion error:', kind, errMsg)
    },
  })
}

/* 输入条打开时聚焦（并收起衣柜，互斥） */
watch(chatOpen, (v) => {
  if (v) {
    wardrobeOpen.value = false
    clearTimeout(bubbleFallback)
    nextTick(() => inputEl.value && inputEl.value.focus())
  }
})

/* 历史抽屉打开时暂停气泡兜底回收 */
watch(historyOpen, (v) => {
  if (v) clearTimeout(bubbleFallback)
  else bubbleFallback = setTimeout(() => { bubble.visible = false }, 6000)
})

/* M2 E3：mood 档位变化（如跌进阴天档）→ 同步常驻微表情基线 */
watch(() => mind.level.value.key, () => sm.refreshBaseline())

/* ================= M3 批次 H：衣柜解锁引擎（双轨解锁） ================= */

const wardrobe = useXiaomuWardrobe({
  mind,
  onUnlock: (itemId) => {
    // 决策 6：解锁通知尊重免打扰；聊天中/气泡显示中推迟到气泡关闭后补弹
    if (prefs.dnd) return
    const it = itemOf(itemId)
    const text = it ? `解锁了新装扮「${it.name}」！快去衣柜看看～` : '有新装扮解锁啦！'
    if (chatOpen || chat.sending.value || bubble.visible) {
      pendingUnlockText = text
      return
    }
    sm.playAction(ACTION.JUMP_JOY)   // 小跳 + 爱心庆祝
    openBubble(text)
  },
})

let pendingUnlockText = null

onMounted(() => {
  wardrobe.ensureActiveDay()   // 保底轨：新的一天 +1（同一天幂等）
  // 老用户既得保留：旧布尔 prefs 迁移后穿着中的非免费物品，静默补解锁记录
  wardrobe.ensureWornUnlocked([prefs.wear.hat, prefs.wear.scarf, prefs.wear.bow])
})

/* ================= M2 批次 F：主动搭话（有由头才开口） ================= */

/* 登录用户 id：与 useChat 同款规则（guest→g:{id}，github→gh:{username}，未登录 ''） */
const auth = useAuthStore()
const chatUserId = computed(() => {
  const u = auth.currentUser
  if (!u) return ''
  return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
})

const proactive = useXiaomuProactive({
  prefs,
  mind,
  isChatOpen: () => chatOpen.value,
  isSending: () => chat.sending.value,
  isBubbleVisible: () => bubble.visible,
  deliver: (text) => {
    sm.playAction(ACTION.LEAN_IN)   // 凑近开口
    openBubble(text)
  },
  userId: () => chatUserId.value,
})

/* 触发时机一：页面加载稳定后（铁律 6 的 3s 由挂载时机保证） */
onMounted(() => {
  setTimeout(() => proactive.maybeFire('mount'), 3000)
})

/* 触发时机二：气泡关闭后重判一次（铁律 3 的「推迟」在此落地）+ M3 解锁通知补弹 */
watch(() => bubble.visible, (v) => {
  if (!v) {
    if (pendingUnlockText) {
      const t = pendingUnlockText
      pendingUnlockText = null
      sm.playAction(ACTION.JUMP_JOY)
      openBubble(t)
      return
    }
    proactive.maybeFire('bubble-closed')
  }
})

/* ================= 收起 / 唤出（小嫩芽）与入场动画 ================= */

/** Alt+X：收起 ⇆ 唤出 */
function onKeydown(e) {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'x' || e.key === 'X')) {
    e.preventDefault()
    if (collapsed.value) wake()
    else collapse()
  }
}
addEventListener('keydown', onKeydown)

onMounted(() => {
  // 首次入场：从地面长出来的弹跳（若上次收起过则直接以嫩芽状态出现，不播）
  if (!prefs.collapsed) playGrow()
})

function playGrow() {
  growing.value = true
  setTimeout(() => { growing.value = false }, 700)
}

/** 收起成小嫩芽（chips「休息」或 Alt+X） */
function collapse() {
  const r = petEl.value ? petEl.value.getBoundingClientRect() : null
  if (r) collapseAnchor.value = { x: r.left + r.width / 2 - 28, y: r.bottom - 64 }
  bubble.visible = false
  chatOpen.value = false
  historyOpen.value = false
  wardrobeOpen.value = false
  chat.abort()          // AbortError 在 api 层静默返回，不会误触发道歉气泡
  busy = false
  prefs.collapsed = true
}

/** 嫩芽长回小木：入场动画 + 伸懒腰 + 打招呼 */
function wake() {
  collapseAnchor.value = null
  prefs.collapsed = false
  playGrow()
  sm.playAction(ACTION.STRETCH)
  clearTimeout(bubbleFallback)
  setTimeout(() => openBubble('嗯——睡得真好。我在的，想聊点什么？', { withChips: true }), 720)
}

onBeforeUnmount(() => {
  clearTimeout(longTimer)
  clearTimeout(bubbleFallback)
  removeEventListener('keydown', onKeydown)
  if (vv) vv.removeEventListener('resize', onVVResize)
  removeEventListener('resize', clampInputBar)
  chat.abort()
  sm.dispose()
  proactive.dispose()   // M2 F：清 visibilitychange 监听
})

/* ================= 内部状态 ================= */
let longTimer = null
let longHeld = false

/* ================= 手机键盘适配 =================
 * visualViewport 被虚拟键盘压缩时，把小木整体抬到键盘上方（输入条随之可见）。
 * 仅影响默认/拖拽位置之外的一层 translateY，不写回 prefs。 */
const kbOffset = ref(0)
let vv = null
function onVVResize() {
  if (!vv) return
  kbOffset.value = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
}
onMounted(() => {
  vv = window.visualViewport
  if (vv) vv.addEventListener('resize', onVVResize)
  addEventListener('resize', clampInputBar, { passive: true })
})
const kbStyle = computed(() =>
  kbOffset.value ? { transform: `translateY(-${kbOffset.value}px)` } : {}
)

/* 输入条视口 clamp：小木贴右（或手机窄屏）时输入条会溢出，同气泡方案做 translateX 修正 */
const inputBar = ref(null)
const inputShift = ref(0)
function clampInputBar() {
  const el = inputBar.value
  if (!el) { inputShift.value = 0; return }
  const r = el.getBoundingClientRect()   // 已含当前 shift，dx 为增量修正（多次调用收敛）
  const margin = 8
  let dx = 0
  if (r.right > innerWidth - margin) dx = innerWidth - margin - r.right
  else if (r.left < margin) dx = margin - r.left
  inputShift.value = Math.round(inputShift.value + dx)
}
watch(chatOpen, (v) => {
  if (v) nextTick(() => { clampInputBar(); requestAnimationFrame(() => { clampInputBar(); requestAnimationFrame(clampInputBar) }) })
  else inputShift.value = 0
})


</script>

<style>
.xm-pet {
  position: fixed;
  right: 14px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  width: 190px;
  z-index: 90;
  touch-action: none;
  cursor: grab;
  transition: left .08s linear, top .08s linear, transform .18s ease;
  -webkit-tap-highlight-color: transparent;
}
.xm-pet.is-dragging { cursor: grabbing; transition: none; }
.xm-pet.is-landing .xm-svg { animation: xmLand .38s cubic-bezier(.34, 1.56, .64, 1); }
.xm-pet.is-landing .xm-skin { animation: xmLand .38s cubic-bezier(.34, 1.56, .64, 1); }
.xm-pet.is-collapsed { width: auto; cursor: pointer; }
.xm-pet.is-growing { animation: xmGrow .62s cubic-bezier(.34, 1.56, .64, 1); transform-origin: 50% 100%; }
@keyframes xmLand {
  0% { transform: scaleY(.92); } 55% { transform: scaleY(1.04); } 100% { transform: scaleY(1); }
}
/* 入场/长出（xm-grow）：从地面弹出来 */
@keyframes xmGrow {
  0% { transform: translateY(46px) scale(.3); opacity: 0; }
  55% { transform: translateY(-6px) scale(1.06); opacity: 1; }
  78% { transform: translateY(2px) scale(.98); }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .xm-pet.is-growing { animation: none; }
}
@media (max-width: 480px) {
  .xm-pet { width: 148px; right: 8px; }
  .xm-mini-input { width: min(230px, 74vw); }
}

/* 历史抽屉 */
.xm-history {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: min(230px, 70vw);
  background: #fff;
  border: 1.5px solid var(--xm-line, #2b2b2b);
  border-radius: 14px;
  padding: 10px 12px;
  z-index: 7;
  max-height: 180px;
  overflow-y: auto;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.xm-history-title { font-size: 11px; opacity: .5; margin-bottom: 6px; }
.xm-history p { font-size: 12px; line-height: 1.55; margin: 0 0 6px; color: #2b2b2b; }
.xm-history p.is-user { opacity: .65; }
.xm-history-empty { opacity: .5; }

/* 迷你输入条 */
.xm-mini-input {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: min(250px, 78vw);
  display: flex;
  gap: 6px;
  align-items: center;
  background: #fff;
  border: 1.5px solid var(--xm-line, #2b2b2b);
  border-radius: 999px;
  padding: 6px 8px;
  z-index: 7;
}
/* 完整对话页入口（批次 D：承接原 FloatingCompanion 的 /companion 职责） */
.xm-chat-tools {
  position: absolute;
  bottom: calc(100% + 56px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.xm-chat-tools a {
  display: inline-block;
  font-size: 11px;
  line-height: 1;
  color: var(--xm-line, #2b2b2b);
  background: #fff;
  border: 1px solid var(--xm-line, #2b2b2b);
  border-radius: 999px;
  padding: 5px 10px;
  text-decoration: none;
  opacity: .75;
  white-space: nowrap;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.xm-chat-tools a:hover { opacity: 1; }
/* 免打扰小铃铛（M2 批次 F）：开启=斜线铃铛+实心底提示 */
.xm-dnd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  color: var(--xm-line, #2b2b2b);
  background: #fff;
  border: 1px solid var(--xm-line, #2b2b2b);
  border-radius: 999px;
  cursor: pointer;
  opacity: .75;
}
.xm-dnd:hover { opacity: 1; }
.xm-dnd.is-on { background: #f0ece2; opacity: 1; }
.xm-mini-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  background: transparent;
  color: #2b2b2b;
  font-family: inherit;
}
.xm-mini-input button {
  border: none;
  background: #2b2b2b;
  color: #fff;
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12px;
  cursor: pointer;
  min-height: 28px;
  font-family: inherit;
}
.xm-mini-input .xm-close { background: #f0ece2; color: #2b2b2b; padding: 5px 9px; }

.xm-drawer-enter-active, .xm-drawer-leave-active { transition: opacity .16s ease, transform .16s ease; }
.xm-drawer-enter-from, .xm-drawer-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
