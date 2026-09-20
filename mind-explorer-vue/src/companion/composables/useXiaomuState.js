/**
 * useXiaomuState —— 小木三轨状态机（任务 2）
 *
 * 设计要点：
 * 1. 三轨正交：
 *    - state  基线循环，CSS [data-state] 驱动；切换时清空动作轨与微表情轨（干净基线）
 *    - action 一次性动作，播完 setTimeout 自动回基线；hold 型（摸头）由 releaseAction() 结束
 *    - micro  微表情叠加（腮红/眯眼/睁大/蔫），互不打断前两轨
 * 2. idle 池：仅当 state==='idle' 且无动作在播时，每 8~20s 随机播一个，不与上一个重复
 * 3. sleep/drag 静默：动作池暂停、不做任何 idle 抽取
 * 4. Page Visibility：切走 → 入睡；回来 → 醒来伸懒腰（有由头的开场，符合人设）
 * 5. prefers-reduced-motion：降级为「只有状态切换、无随机动作」（动效尊重系统设置）
 */
import { ref, reactive, readonly, onUnmounted, getCurrentInstance } from 'vue'
import { ACTIONS, STATES, MICRO_EXPRESSIONS, pickIdleAction, ACTION } from '../core/actions'

const IDLE_MIN = 8000
const IDLE_JITTER = 12000 // 8s + rand(0~12s) = 8~20s

export function useXiaomuState(options = {}) {
  const {
    onActionFx = null,   // (fxName) => void，动作附带特效回调，如 'hearts'
    // ---- M2 mood 档位钩子（均可选，不传 = M1 行为不变）----
    baselineMicros = null, // () => string[]，当前档位应常驻的微表情（清洗后自动重绘）
    idleWeightMod = null,  // (name, weight) => number，idle 池权重调制（mood 档位）
  } = options

  /* ---- 三轨状态 ---- */
  const state = ref('idle')
  const action = ref(null)
  const micro = reactive({ blush: false, eyesClosed: false, eyesWide: false, earDroop: false })

  /* ---- 内部计时器 ---- */
  let actionTimer = null
  let idleTimer = null
  const microTimers = {}
  let lastIdleAction = null
  let disposed = false

  const inVue = !!getCurrentInstance()
  const reducedMotion =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ================= 状态轨 ================= */

  /**
   * 切换基线状态。切换即清空动作轨/微表情轨——调用方需要联动表演时，
   * 先 setState 再 playAction（顺序驱动，避免轨道打架）。
   */
  function setState(s) {
    if (!STATES.includes(s) || state.value === s) return
    state.value = s
    clearAction()
    clearAllMicro()
    if (s === 'idle') scheduleIdle()
    else clearTimeout(idleTimer)
  }

  /* ================= 动作轨 ================= */

  /**
   * 播放一个一次性动作；hold 型动作返回 true 后需调用 releaseAction() 结束。
   * @returns {boolean} 是否成功起播
   */
  function playAction(name) {
    const def = ACTIONS[name]
    if (!def) return false
    if (reducedMotion && def.pool !== 'hold') return false
    if (state.value === 'sleep' || state.value === 'drag') return false

    clearActionTimer()
    action.value = name

    if (def.micro) {
      // 整组一次传入（applyMicro 遍历 names；M1 曾误传单个字符串导致按字符拆开、动作自带 micro 全部失效）
      applyMicro(def.micro, def.hold ? 0 : (def.duration || 1000) * 0.9)
    }
    if (def.fx && onActionFx) onActionFx(def.fx)

    if (!def.hold) {
      actionTimer = setTimeout(() => {
        if (action.value === name) action.value = null
        actionTimer = null
      }, def.duration)
    }
    return true
  }

  /** 结束 hold 型动作（松手） */
  function releaseAction() {
    const def = action.value ? ACTIONS[action.value] : null
    if (def && def.hold) {
      action.value = null
      clearAllMicro()
    }
    if (state.value === 'idle') scheduleIdle()
  }

  function clearAction() {
    clearActionTimer()
    action.value = null
    clearAllMicro()
  }

  function clearActionTimer() {
    if (actionTimer) { clearTimeout(actionTimer); actionTimer = null }
  }

  /* ================= 微表情轨 ================= */

  /** 叠加一个微表情；duration<=0 表示常驻直到 clear */
  function playMicro(name, duration) {
    const def = MICRO_EXPRESSIONS[name]
    if (!def || !(name in micro)) return
    micro[name] = true
    if (microTimers[name]) clearTimeout(microTimers[name])
    const d = duration ?? def.duration
    if (d > 0) {
      // 到期后重绘档位基线：动作自带的有限微表情（如 apologetic 的 earDroop 2s）
      // 不应误杀 mood 基线常驻（如阴天档的 earDroop）——到期清掉立刻补回
      microTimers[name] = setTimeout(() => {
        micro[name] = false
        delete microTimers[name]
        reapplyBaseline()
      }, d)
    }
  }

  function applyMicro(names, duration) {
    for (const n of names) playMicro(n, duration)
  }

  function clearAllMicro() {
    for (const k of Object.keys(microTimers)) clearTimeout(microTimers[k])
    for (const k of Object.keys(micro)) micro[k] = false
    microTimersClear()
    reapplyBaseline()
  }

  /** 清洗后重绘 mood 档位基线（直接置 true 不建 timer = 常驻，直到下次清洗/refreshBaseline） */
  function reapplyBaseline() {
    if (!baselineMicros || disposed) return
    for (const n of baselineMicros()) {
      if (n in micro && !micro[n]) micro[n] = true
    }
  }

  /**
   * mood 档位变化时同步基线：只动「无 timer 的常驻位」，
   * 不碰动作播放中的有限微表情（如 leanIn 补的 eyesWide 1.5s）。
   */
  function refreshBaseline() {
    if (!baselineMicros || disposed) return
    const want = new Set(baselineMicros().filter((n) => n in micro))
    for (const k of Object.keys(micro)) {
      if (micro[k] && !want.has(k) && !microTimers[k]) micro[k] = false
    }
    for (const k of want) {
      if (!micro[k]) { delete microTimers[k]; micro[k] = true }
    }
  }

  function microTimersClear() { for (const k in microTimers) delete microTimers[k] }

  /* ================= idle 池调度 ================= */

  function scheduleIdle() {
    clearTimeout(idleTimer)
    if (reducedMotion || disposed) return
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (state.value === 'idle' && !action.value) {
        const next = pickIdleAction(lastIdleAction, idleWeightMod || undefined)
        lastIdleAction = next
        playAction(next)
        // playAction 的收尾计时器不重排 idle；动作播完后由下一次 scheduleIdle 接力
        setTimeout(() => { if (state.value === 'idle') scheduleIdle() }, 50)
        return
      }
      scheduleIdle()
    }, IDLE_MIN + Math.random() * IDLE_JITTER)
  }

  /* ================= 页面可见性（有由头的入睡与醒来） ================= */

  function onVisibility() {
    if (disposed) return
    if (document.hidden) {
      state.value = 'sleep'
      clearAction()
      clearTimeout(idleTimer)
    } else if (state.value === 'sleep') {
      state.value = 'idle'
      scheduleIdle()
      // 醒来伸懒腰：延迟一点，像刚缓过神
      setTimeout(() => { if (!disposed && state.value === 'idle') playAction(ACTION.STRETCH) }, 600)
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  /* ================= 清理 ================= */

  function dispose() {
    disposed = true
    clearActionTimer()
    clearTimeout(idleTimer)
    clearAllMicro()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
  if (inVue) onUnmounted(dispose)

  return {
    state: readonly(state),
    action: readonly(action),
    micro,
    setState,
    playAction,
    releaseAction,
    playMicro,
    refreshBaseline,
    dispose,
  }
}
