/**
 * useXiaomuMind —— 小木内心引擎（M2 批次 E，任务 E1）
 *
 * mood 是一个连续量（-100 ~ +100），有惯性：
 *   - 事件推高/推低：对话情绪标签（meta.emotion）、摸头、聊完一轮天
 *   - 时间自然回落：每 60s 向 0 收敛 5%（约 20 分钟从 -50 回到 -18），页面隐藏期间暂停
 *   - 会话内连续，新会话归零（打开页面不被昨天的情绪绑架；长期情绪记录属后端 mood_diary / M4）
 *
 * 对外输出三样东西（全部由 XiaomuPet 接线消费，本引擎不碰动画/状态机）：
 *   level            —— 五档：阴天/微雨/平静/晴/开心（驱动常驻微表情基线）
 *   baselineMicros() —— 当前档位应常驻的微表情（阴天 earDroop、开心 blush）
 *   idleWeightMod()  —— idle 池动作权重调制（低落时蔫动作更多、开心时欢快动作更多）
 *
 * negativeStreak（连续负面标签数）本阶段只埋不消费，批次 F 主动关怀触发器用。
 */
import { computed, readonly, ref } from 'vue'

/* ---- 档位表：min 为进入该档的下限；判断时从高档往低档找第一个 min ≤ value ---- */
const LEVEL_TABLE = [
  { key: 'gloomy', min: -100, label: '阴天' },
  { key: 'drizzle', min: -40, label: '微雨' },
  { key: 'calm', min: -10, label: '平静' },
  { key: 'sunny', min: 10, label: '晴' },
  { key: 'joyful', min: 40, label: '开心' },
]

/* ---- 事件增量表（后端 6 种情绪标签 → mood 增量；未知/缺失标签 0） ---- */
const EMOTION_BUMPS = { low: -18, anxious: -12, angry: -8, lost: -8, grateful: 15, calm: 5 }
const NEGATIVE_EMOTIONS = ['low', 'anxious', 'angry', 'lost']
const BUMP_CHAT_DONE = 2    // 一轮完整对话结束：聊过天这件事本身让它有点开心
const BUMP_HEAD_PAT = 3     // 摸头：被安慰（60s 冷却防连点刷分）
const HEAD_PAT_COOLDOWN = 60000

/* ---- 时间衰减：每 60s 向 0 收敛 5%（惰性拟人：难过不会立刻好，但会慢慢过去） ---- */
const DECAY_INTERVAL = 60000
const DECAY_FACTOR = 0.95

/* ---- 档位 → 常驻微表情基线 ---- */
const BASELINE_MICROS = {
  gloomy: ['earDroop'],   // 阴天：耳朵/叶芽一直蔫着
  joyful: ['blush'],      // 开心：一直有点脸红
}

/* ---- 档位 → idle 池权重调制 ----
 * low/high 两组是动作语义分类；mod 表里既可用 low/high 整组乘数，
 * 也可用动作名单独覆盖（如 joyful 的 yawn ×0.5：开心的人不怎么打哈欠）。 */
const IDLE_LOW = ['yawn', 'lookAround', 'scratchHead']
const IDLE_HIGH = ['hopSteps', 'tiptoe', 'swayLeaf', 'touchLeaf']
const IDLE_MODS = {
  gloomy: { low: 3, high: 0.3 },
  drizzle: { high: 0.6 },
  sunny: { low: 0.7 },
  joyful: { high: 2, yawn: 0.5 },
}

/* ---- 模块级单例：SPA 全程同一个内心，路由切换不掉 ---- */
const mood = ref(0)
const negativeStreak = ref(0)
let decayTimer = null
let lastHeadPat = 0

function levelOf(v) {
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (v >= LEVEL_TABLE[i].min) return LEVEL_TABLE[i]
  }
  return LEVEL_TABLE[2] // 理论不可达（表首 min=-100）
}

const level = computed(() => levelOf(mood.value))

/** 衰减心跳：惰性启动，页面隐藏期间暂停（离开的时间不算） */
function ensureDecay() {
  if (decayTimer || typeof document === 'undefined') return
  decayTimer = setInterval(() => {
    if (document.hidden) return
    if (mood.value === 0) return
    const next = Math.abs(mood.value) * DECAY_FACTOR
    mood.value = next < 0.5 ? 0 : Math.sign(mood.value) * next
  }, DECAY_INTERVAL)
}

function clampMood(v) { return Math.max(-100, Math.min(100, v)) }

/** 事件增量（clamped 到 ±100） */
function bump(delta) {
  mood.value = clampMood(mood.value + delta)
}

/**
 * 消费后端情绪标签：bump 增量 + 维护负面连续计数。
 * @param {string|{key:string,label?:string,emoji?:string}|null} tag
 *        meta.emotion——线上后端返回对象 {key,label,emoji}（如 anxious「有些焦虑」😰），
 *        兼容传纯字符串；null/undefined/未知 key 一律 0。
 * @returns {number} 实际增量；0 表示未知/缺失标签，调用方据此跳过演绎
 */
function setFromEmotion(tag) {
  const key = typeof tag === 'string' ? tag : (tag && tag.key) || ''
  const delta = EMOTION_BUMPS[key]
  if (!delta) { negativeStreak.value = 0; return 0 }
  bump(delta)
  negativeStreak.value = NEGATIVE_EMOTIONS.includes(key) ? negativeStreak.value + 1 : 0
  return delta
}

/** 摸头：+3，60s 冷却 */
function noteHeadPat() {
  const now = Date.now()
  if (now - lastHeadPat < HEAD_PAT_COOLDOWN) return
  lastHeadPat = now
  bump(BUMP_HEAD_PAT)
}

/** 一轮完整对话结束：+2 */
function noteChatDone() { bump(BUMP_CHAT_DONE) }

/** 当前档位应常驻的微表情（供状态机清洗后重绘） */
function baselineMicros() { return BASELINE_MICROS[level.value.key] || [] }

/** idle 池权重调制（供 pickIdleAction 的 modFn：modFn(name, weight) → number） */
function idleWeightMod(name, weight) {
  const mod = IDLE_MODS[level.value.key]
  if (!mod) return weight
  if (mod[name] != null) return weight * mod[name]
  if (mod.low != null && IDLE_LOW.includes(name)) return weight * mod.low
  if (mod.high != null && IDLE_HIGH.includes(name)) return weight * mod.high
  return weight
}

/** 仅供测试/调试：内心归零 */
function resetMind() { mood.value = 0; negativeStreak.value = 0 }

ensureDecay()

export function useXiaomuMind() {
  return {
    mood: readonly(mood),
    level,                       // computed，值为 LEVEL_TABLE 内常量对象（引用稳定，watch 按引用比较即按档位比较）
    negativeStreak: readonly(negativeStreak),
    bump,
    setFromEmotion,
    noteHeadPat,
    noteChatDone,
    baselineMicros,
    idleWeightMod,
    resetMind,
  }
}
