/**
 * useXiaomuProactive —— 小木主动搭话（M2 批次 F，任务 F1/F2/F3）
 *
 * 像朋友：有由头才开口，不无端推送。4 个触发器（priority 高者先判）：
 *   daily-greeting   P10  登录用户当天首次访问 → 后端 getGreeting（失败降级本地通用问候）
 *   low-mood-care    P8   连续 3 轮负面情绪标签 → 轻声关怀
 *   late-night       P5   深夜时段（23:00–05:00）首次出现 → 陪一会儿
 *   back-after-while P3   离开 ≥30min 后回流 → 轻量欢迎
 *
 * 防打扰铁律（maybeFire 内按序判定，任一命中即静默/等待重判）：
 *   1. 免打扰开启（prefs.dnd）→ 全部静默（被动聊天不受影响）
 *   2. 聊天打开或发送中 → 不弹
 *   3. 气泡正在显示 → 不弹（气泡关闭后由调用方重判一次）
 *   4. 页面不可见 → 不弹（visibility 回来时本模块自动重判）
 *   5. 今日已达上限（3 次）→ 静默
 *   6. 页面加载后 3s 内不弹（启动稳定期）
 *
 * 每日计数：localStorage xm-proactive-YYYYMMDD { count, ids[], ts{} }，
 * 跨天自然换 key；greeting 计入上限（3 = greeting 1 固定 + 彩蛋共享 2）。
 *
 * 演出由调用方 deliver() 承担（本模块不碰动作轨/气泡）。
 * forceFire(id) 仅供调试/验收：跳过 when 与冷却，铁律 1/2/3/4 仍然生效。
 */
import { getCurrentInstance, onUnmounted } from 'vue'
import { companionApi } from '../../api/companion'

const DAILY_LIMIT = 3
const BOOT_QUIET = 3000
const NIGHT_START = 23          // 23:00
const NIGHT_END = 5             // 05:00
const AWAY_MIN = 30 * 60000     // 回流阈值：离开 ≥30min
const COOLDOWN_DAY = 20 * 3600000   // 跨天触发器冷却 20h
const COOLDOWN_BACK = 6 * 3600000   // 回流冷却 6h

const FALLBACK_GREETING = '今天也来看我啦，我在的。'
const NIGHT_LINES = [
  '这么晚还没睡呀……我不吵你，陪你一会儿。',
  '夜里安静，心事要是重，可以跟我说说。',
]
const BACK_LINES = [
  '回来啦。刚才是去忙了吗？',
  '你回来啦，我一直在的。',
]
const CARE_LINES = [
  '这几句话听着心里沉沉的……我陪你。',
  '你好像有点累。想说话的时候，我一直都在。',
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

/** 当天 key（本地时区 YYYYMMDD） */
function dayKey(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function loadToday() {
  try {
    const raw = JSON.parse(localStorage.getItem('xm-proactive-' + dayKey()))
    return raw && typeof raw === 'object' ? { count: raw.count || 0, ids: raw.ids || [], ts: raw.ts || {} } : { count: 0, ids: [], ts: {} }
  } catch { return { count: 0, ids: [], ts: {} } }
}
function saveToday(t) {
  try { localStorage.setItem('xm-proactive-' + dayKey(), JSON.stringify(t)) } catch { /* 隐私模式静默 */ }
}

/** 深夜时段判断（纯函数，便于验收） */
function isLateNight(d = new Date()) {
  const h = d.getHours()
  return h >= NIGHT_START || h < NIGHT_END
}

export function useXiaomuProactive(options = {}) {
  const {
    prefs,               // useXiaomuPrefs 的 reactive（读 dnd）
    mind,                // useXiaomuMind 返回值（读 negativeStreak）
    isChatOpen = () => false,
    isSending = () => false,
    isBubbleVisible = () => false,
    deliver = () => {},  // (text) => void：演出（动作 + 气泡）
    userId = () => '',   // 登录用户 id（greeting 用）
  } = options

  const bootAt = Date.now()
  let awaySince = 0      // 页面隐藏时刻；0 = 当前可见
  let disposed = false

  /* ---- 触发器表（闭包引用依赖） ---- */
  const TRIGGERS = [
    {
      id: 'daily-greeting', priority: 10, cooldown: COOLDOWN_DAY,
      when: () => !!userId(),
      build: async () => {
        const r = await companionApi.getGreeting(userId()).catch(() => null)
        const text = r && r.ok && typeof r.greeting === 'string' ? r.greeting.trim() : ''
        return { text: text || FALLBACK_GREETING }
      },
    },
    {
      id: 'low-mood-care', priority: 8, cooldown: COOLDOWN_DAY,
      when: () => (mind ? mind.negativeStreak.value >= 3 : false),
      build: () => ({ text: pick(CARE_LINES) }),
    },
    {
      id: 'late-night', priority: 5, cooldown: COOLDOWN_DAY,
      when: () => isLateNight(),
      build: () => ({ text: pick(NIGHT_LINES) }),
    },
    {
      id: 'back-after-while', priority: 3, cooldown: COOLDOWN_BACK,
      when: () => awaySince > 0 && Date.now() - awaySince >= AWAY_MIN,
      build: () => ({ text: pick(BACK_LINES) }),
    },
  ]

  /**
   * 尝试触发一轮主动搭话。
   * @param {string} source 调用来源（mount/visible/chat-done/bubble-closed，仅记录用）
   * @param {string|null} forceId 调试：指定触发器 id，跳过 when 与冷却（铁律仍生效）
   * @returns {Promise<string|null>} 触发的触发器 id；null = 未触发
   */
  async function maybeFire(source = '', forceId = null) {
    if (disposed) return null
    if (prefs.dnd) return null                                                    // 铁律 1
    if (isChatOpen() || isSending()) return null                                  // 铁律 2
    if (isBubbleVisible()) return null                                            // 铁律 3（气泡关闭后调用方重判）
    if (typeof document !== 'undefined' && document.hidden) return null           // 铁律 4（visible 时自动重判）
    if (Date.now() - bootAt < BOOT_QUIET && source !== 'force') return null       // 铁律 6
    const today = loadToday()
    if (today.count >= DAILY_LIMIT && !forceId) return null                       // 铁律 5

    const list = forceId ? TRIGGERS.filter((t) => t.id === forceId) : TRIGGERS
    for (const t of list) {
      if (!forceId) {
        if (today.ids.includes(t.id)) continue               // 今天已触发过（跨天触发器等价冷却）
        const last = today.ts[t.id]
        if (last && Date.now() - last < t.cooldown) continue // 冷却中
        if (!t.when()) continue
      }
      try {
        const out = await t.build()
        if (out && out.text) {
          today.count += 1
          if (!today.ids.includes(t.id)) today.ids.push(t.id)
          today.ts[t.id] = Date.now()
          saveToday(today)
          deliver(out.text)
          return t.id
        }
      } catch { /* 单个触发器失败不阻断后续 */ }
    }
    return null
  }

  /** 调试/验收：强制尝试指定触发器（跳过 when 与冷却，铁律 1/2/3/4 仍生效） */
  function forceFire(id) { return maybeFire('force', id) }

  /** 调试/验收：当前状态快照 */
  function status() {
    const t = loadToday()
    return {
      dnd: !!prefs.dnd,
      count: t.count,
      ids: [...t.ids],
      lateNight: isLateNight(),
      awayMinutes: awaySince > 0 ? Math.round((Date.now() - awaySince) / 60000) : 0,
      negativeStreak: mind ? mind.negativeStreak.value : 0,
      loggedIn: !!userId(),
    }
  }

  /* ---- 页面可见性：hidden 记离开时刻；visible 重判（覆盖回流/深夜） ---- */
  function onVisibility() {
    if (disposed) return
    if (document.hidden) {
      awaySince = Date.now()
    } else {
      maybeFire('visible')
    }
  }
  const inVue = !!getCurrentInstance()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }
  function dispose() {
    disposed = true
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
  if (inVue) onUnmounted(dispose)

  return { maybeFire, forceFire, status, dispose }
}
