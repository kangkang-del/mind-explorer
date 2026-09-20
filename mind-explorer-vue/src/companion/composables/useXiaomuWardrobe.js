/**
 * useXiaomuWardrobe —— 小木衣柜解锁引擎（M3 批次 H，任务 H2/H3）
 *
 * 双轨解锁，全部本地判定：
 *   保底轨 —— 累计使用天数（xm-active-days：{ days, last }，同一天不重复计数）
 *   彩蛋轨 —— 情绪里程碑：
 *     joyful-stay  开心档累计驻留 10 分钟（本引擎 60s tick 累计，页面隐藏暂停）
 *     recover      从阴天/微雨档恢复到平静以上（watch mind.level 跨档检测）
 *     headpat-20   摸头累计 20 次（XiaomuPet 摸头处调 noteHeadPat）
 *
 * 解锁记录 xm-unlocks-v1：{ items: [物品id], ms: { 里程碑id: 时间戳 } }。
 * 达成即触发 onUnlock(物品id) 回调（通知演出由 XiaomuPet 处理，尊重免打扰）。
 *
 * 设计约束：
 *   - mind 引擎零改动（驻留/恢复靠读 level，摸头由组件层转调）
 *   - 模块级单例，SPA 全程一个衣柜；options 仅首次调用生效
 *   - debugSetDays / debugUnlock / debugMilestone 仅供验收
 */
import { computed, reactive, readonly, ref, watch } from 'vue'
import { ITEMS, itemOf, MILESTONES, HEAD_PAT_GOAL, JOYFUL_STAY_GOAL } from '../core/wardrobe'

const KEY_DAYS = 'xm-active-days'
const KEY_UNLOCKS = 'xm-unlocks-v1'
const DAY_MS = 60000 // joyful 驻留 tick 粒度

function todayKey(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function loadDays() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_DAYS))
    if (raw && Number.isFinite(raw.days) && typeof raw.last === 'string') return raw
  } catch { /* 静默 */ }
  return { days: 0, last: '' }
}
function saveDays(d) {
  try { localStorage.setItem(KEY_DAYS, JSON.stringify(d)) } catch { /* 静默 */ }
}
function loadUnlocks() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_UNLOCKS))
    if (raw && Array.isArray(raw.items)) return { items: raw.items, ms: raw.ms || {} }
  } catch { /* 静默 */ }
  return { items: [], ms: {} }
}
function saveUnlocks(u) {
  try { localStorage.setItem(KEY_UNLOCKS, JSON.stringify(u)) } catch { /* 静默 */ }
}

/* ---- 模块级单例状态 ---- */
const days = loadDays()
const activeDays = ref(days.days)
const unlocks = reactive(loadUnlocks())
const joyStayMs = ref(0)
const headPatCount = ref(0)
const lastUnlocked = ref(null)   // 最近一次解锁的物品 id（面板高亮/通知用）

let mindRef = null
let onUnlockCb = null
let stayTimer = null
let disposed = false
let booted = false

function unlockItem(id, { notify = true } = {}) {
  if (unlocks.items.includes(id)) return false
  unlocks.items.push(id)
  saveUnlocks(unlocks)
  lastUnlocked.value = id
  if (notify && onUnlockCb && !disposed) onUnlockCb(id)
  return true
}

/** 里程碑达成：记录时间戳 + 解锁关联物品（一个里程碑对应一件） */
function reachMilestone(msId) {
  if (unlocks.ms[msId]) return false
  unlocks.ms[msId] = Date.now()
  saveUnlocks(unlocks)
  const item = ITEMS.find((it) => it.unlock && it.unlock.type === 'milestone' && it.unlock.id === msId)
  if (item) unlockItem(item.id)
  return true
}

/** 逐条检查所有未解锁物品的达成条件（天数型；里程碑型由各自达成路径触发） */
function evaluateDays() {
  for (const it of ITEMS) {
    if (it.unlock.type === 'days' && activeDays.value >= it.unlock.days) {
      unlockItem(it.id)
    }
  }
}

function ensureTick() {
  if (stayTimer || typeof document === 'undefined') return
  stayTimer = setInterval(() => {
    if (disposed || document.hidden || !mindRef) return
    if (mindRef.level.value.key === 'joyful') {
      joyStayMs.value += DAY_MS
      if (joyStayMs.value >= JOYFUL_STAY_GOAL) reachMilestone('joyful-stay')
    }
  }, DAY_MS)
}

export function useXiaomuWardrobe(options = {}) {
  const { mind = null, onUnlock = null } = options

  if (!booted) {
    booted = true
    mindRef = mind
    onUnlockCb = onUnlock

    /* 历史已达成的里程碑在 loadUnlocks.ms 里有记录，关联物品确保在 items 里（兜底补齐） */
    for (const msId of Object.keys(unlocks.ms)) reachMilestoneSilent(msId)

    /* 低落恢复检测：watch 跨档（gloomy/drizzle → calm/sunny/joyful） */
    if (mind) {
      watch(mind.level, (lv, oldLv) => {
        if (disposed) return
        const wasLow = oldLv && (oldLv.key === 'gloomy' || oldLv.key === 'drizzle')
        const nowOk = lv && lv.key !== 'gloomy' && lv.key !== 'drizzle'
        if (wasLow && nowOk) reachMilestone('recover')
      })
    }

    ensureTick()
    evaluateDays()
  }

  function reachMilestoneSilent(msId) {
    if (unlocks.ms[msId]) {
      const item = ITEMS.find((it) => it.unlock && it.unlock.type === 'milestone' && it.unlock.id === msId)
      if (item && !unlocks.items.includes(item.id)) unlockItem(item.id, { notify: false })
    }
  }

  /** 每天首次挂载调用：新的一天 → 使用天数 +1 → 复查天数解锁 */
  function ensureActiveDay() {
    const today = todayKey()
    if (days.last === today) return activeDays.value
    days.days += 1
    days.last = today
    saveDays(days)
    activeDays.value = days.days
    evaluateDays()
    return activeDays.value
  }

  /** 摸头计数（XiaomuPet 摸头处转调）；达 20 次解锁星星结 */
  function noteHeadPat() {
    headPatCount.value += 1
    if (headPatCount.value >= HEAD_PAT_GOAL) reachMilestone('headpat-20')
  }

  const isUnlocked = (id) => {
    const it = itemOf(id)
    if (it && it.unlock.type === 'free') return true   // 免费物品恒可选
    return unlocks.items.includes(id)
  }
  const unlockedList = computed(() => ITEMS.filter((it) => isUnlocked(it.id)).map((it) => it.id))

  /** 老用户既得保留：穿着中的非免费物品若未解锁记录，静默补上（旧 prefs 布尔迁移场景） */
  function ensureWornUnlocked(ids) {
    let changed = false
    for (const id of ids) {
      const it = itemOf(id)
      if (it && it.unlock.type !== 'free' && !unlocks.items.includes(id)) {
        unlocks.items.push(id)
        changed = true
      }
    }
    if (changed) saveUnlocks(unlocks)
  }

  function status() {
    return {
      activeDays: activeDays.value,
      joyStayMs: joyStayMs.value,
      headPatCount: headPatCount.value,
      unlocked: [...unlocks.items],
      milestones: { ...unlocks.ms },
      lastUnlocked: lastUnlocked.value,
      goals: { headPatGoal: HEAD_PAT_GOAL, joyfulStayGoal: JOYFUL_STAY_GOAL },
    }
  }

  /* ---- 验收调试接口 ---- */
  function debugSetDays(n) {
    days.days = n
    days.last = todayKey()
    saveDays(days)
    activeDays.value = n
    evaluateDays()
    return status()
  }
  function debugUnlock(id) { return { ok: unlockItem(id), status: status() } }
  function debugMilestone(msId) {
    if (!MILESTONES[msId]) return { ok: false, reason: 'unknown milestone' }
    reachMilestone(msId)
    return { ok: true, status: status() }
  }

  return {
    activeDays: readonly(activeDays),
    joyStayMs: readonly(joyStayMs),
    headPatCount: readonly(headPatCount),
    lastUnlocked: readonly(lastUnlocked),
    isUnlocked,
    unlockedList,
    ensureActiveDay,
    ensureWornUnlocked,
    noteHeadPat,
    status,
    debugSetDays,
    debugUnlock,
    debugMilestone,
  }
}
