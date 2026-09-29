/**
 * useXiaomuIat —— 语音输入的**编排层**（M6-2c）
 *
 * 分工（与 M6-2a 同一套范式）：
 *   · `companion/core/iat.js`      —— 纯逻辑：状态机 + 协议帧 + 解析 + 分型 + 欠采（Node 可直接单测）
 *   · 本文件                        —— 执行副作用：麦克风、签票、WebSocket、界面回调
 *   · `api/xiaomuVoice.js`          —— 只负责「领票」（不接触任何密钥）
 *
 * 🔴 三条铁律：
 *   1. **模块级单例**（同 `useMicCapture` / `useXiaomuVoice`）。对话页与桌宠两个入口
 *      **必须落到同一 state、同一状态机、同一条 WS** —— 否则会出现「两套状态机 +
 *      麦克风被争抢 + 票签两张 + 额度扣两次」（M6-2a 解决过的同类问题，这里必须复述）。
 *   2. **唯一时间源**：只有 `dispatch()` 给事件盖 `at`（`performance.now()`）。
 *      `core/iat.js` 里没有、也不允许有取时间的代码 ⇒ 状态机在 Node 里可完全离线断言。
 *   3. **任何异常都不抛**：语音输入是加分项，出错必须给人话、静默收场。
 *
 * 关键设计（详见 `M6-2c-改动清单.md`）：
 *   · **延迟签发（250ms）**：按下先本地采集，250ms 后才签票 ⇒ 「按一下就松」零额度成本。
 *     票未到时音频进 `state.pending`，`ws:open` 后回灌。
 *   · **灰色地带**：250–800ms 松手 ⇒ 票已签、额度已扣、音频不足 ⇒ `abandoned`
 *     （**不发末帧**：损失只落在站点配额，不消耗讯飞每日额度）。
 *   · **额度前置拦截**：`localStorage` 只是 **UX 优化**（少一次必被 429 的请求），
 *     **不是安全边界**；真正的限流在后端 `rateAllow()`。
 */
import { shallowRef, computed, watch } from 'vue'
import { useMicCapture } from './useMicCapture'
import { useXiaomuVoice } from './useXiaomuVoice'
import { useXiaomuPrefs } from './useXiaomuPrefs'
import { useIdentity } from '../../composables/useIdentity'
import { iatTicket } from '../../api/xiaomuVoice'
import {
  reduce,
  initialState,
  buildFrame,
  createParser,
  suppressSpeech,
  uiTextOf,
  quotaGuardKey,
  MESSAGES,
  PTT_LABEL,
} from '../core/iat'

/** 模块级单例（🔴 见文件头铁律 1） */
let shared = null

/**
 * 哪些状态下**允许重新按下**开始新一次会话。
 *   · `idle`                                      —— 常态
 *   · `success`(1.2s) / `empty`(1.8s) / `abandoned`(1.8s) / `failed`(5s)
 *                                                 —— 结果停留期（core 里明确实现了
 *                                                 `ptt:down` 的「先入框再开新会话」分支）
 * 🔴 早期版本写成 `phase !== 'idle'` 就 return false ⇒ 上表四态**全被挡死**：
 *    `failed` 要等满 5 秒才能重试（用户看到「再试一次？」却按不动）；
 *    core 里那两个分支**永远不可达**。**不可达的分支 = 没人测过的分支。**
 * ⚠️ `denied` **故意不在表内**：它是「未闭合」态（无 hold 计时、`nextDeadline` 为 null），
 *    必须由用户点状态条上的 × 显式收掉；core 也没实现从 `denied` 触发 `ptt:down`。
 */
const RETRYABLE = ['idle', 'success', 'empty', 'abandoned', 'failed']

export function useXiaomuIat() {
  if (shared) return shared

  const mic = useMicCapture()
  const voice = useXiaomuVoice()
  const prefs = useXiaomuPrefs()
  const ident = useIdentity()

  /** 静态可用性：安全上下文 + getUserMedia + AudioWorklet + WebSocket */
  const supported = mic.supported && typeof WebSocket === 'function'

  const state = shallowRef(initialState())
  const level = mic.level
  const phase = computed(() => state.value.phase)
  const modifiers = computed(() => state.value.modifiers)
  const text = computed(() => state.value.text)
  const failKind = computed(() => state.value.failKind)
  const notice = computed(() => state.value.notice)
  const uiText = computed(() => uiTextOf(state.value))
  const pttLabel = computed(() => (state.value.phase === 'recording' ? PTT_LABEL.recording : PTT_LABEL.idle))
  /** 录音中（驱动波形条显示） */
  const live = computed(() => state.value.phase === 'recording' || state.value.phase === 'arming')
  /** 状态条是否应显示 */
  const visible = computed(() => state.value.phase !== 'idle' || !!state.value.notice)
  /** 提示类（需要用户可关闭） */
  const dismissible = computed(() => ['denied', 'failed', 'abandoned', 'empty', 'success'].includes(state.value.phase) || !!state.value.notice)
  /** 警示色（失败/拒绝/超额） */
  const warn = computed(() =>
    state.value.phase === 'failed' || state.value.phase === 'denied' || !!state.value.notice)

  let timer = null
  let ws = null
  let parser = null
  let ticketToken = 0
  let maxBufferDepthMs = 0
  /** 本次会话的回调（`press({onResult})` 派发；不复用全局回调 ⇒ 两次会话不会串台） */
  let hooks = { onResult: null, onFail: null }

  const now = () => Math.round(performance.now())

  /* ---------------- 唯一的 dispatch 出口 ---------------- */

  function dispatch(type, payload) {
    const event = { type, at: now(), ...(payload || {}) }
    let r
    try {
      r = reduce(state.value, event)
    } catch (e) {
      // 契约违例（缺 at 等）只可能是编码错误：这里兜一层，绝不让它炸到用户界面
      console.warn('[xiaomu-iat] reduce 失败：', e)
      return null
    }
    state.value = r.state
    armTimer(r.nextWakeMs)
    // 副作用按声明顺序执行（顺序即协议顺序，别改）
    for (const ef of r.effects) {
      try {
        runEffect(ef)
      } catch (e) {
        console.warn('[xiaomu-iat] effect 失败：', ef && ef.type, e)
      }
    }
    return r
  }

  /** 只维护**一个**定时器；`nextWakeMs` 由 reducer 给出（绝对时刻） */
  function armTimer(deadline) {
    if (timer) { clearTimeout(timer); timer = null }
    if (deadline == null) return
    const delay = Math.max(0, Math.min(deadline - now(), 2 ** 31 - 1))
    timer = setTimeout(() => { timer = null; dispatch('tick') }, delay)
  }

  /* ---------------- 副作用执行 ---------------- */

  function runEffect(ef) {
    switch (ef.type) {
      case 'mic.start': void doMicStart(); break
      case 'mic.stop': void doMicStop(ef.flushTail !== false); break
      case 'ticket.request': void doTicketRequest(); break
      case 'ws.connect': doWsConnect(); break
      case 'ws.send': doWsSend(ef.kind, ef.bytes); break
      case 'ws.close': doWsClose(ef.code); break
      case 'voice.stop': try { voice.stop() } catch { /* 静默 */ } break
      case 'ui.emit': emitUi(ef); break
      case 'observe.bufferDepth':
        if (ef.ms > maxBufferDepthMs) {
          maxBufferDepthMs = ef.ms
          if (ef.ms >= 1500) console.warn('[xiaomu-iat] 签票/建连等待中，音频缓冲已达', ef.ms, 'ms')
        }
        break
      case 'log': console.warn('[xiaomu-iat]', ef.msg || ''); break
      default: break
    }
  }

  async function doMicStart() {
    if (!mic.supported) { dispatch('mic:error', { name: 'Unsupported' }); return }
    let ok = false
    try {
      ok = await mic.start({
        onChunk: (bytes) => dispatch('mic:chunk', { bytes }),
        // 设备被拔掉 / 系统回收 / 权限被撤 ⇒ 立刻收场（见 core 的 recording/arming 分支）。
        // ⚠️ 正常 stop() 不会触发它：useMicCapture 在 teardown 里先摘 onended 再 stop。
        onEnded: () => dispatch('track:ended'),
      })
    } catch {
      ok = false
    }
    if (ok) dispatch('mic:ready')
    else dispatch('mic:error', { name: (mic.errorName && mic.errorName.value) || 'Error' })
  }

  async function doMicStop(flushTail) {
    try {
      await mic.stop({ flushTail })
    } catch { /* 静默 */ }
    // flushTail=true ⇒ useMicCapture 已等 worklet 的 flushed ack（残尾样本在 ack 之前送达）
    if (flushTail) dispatch('mic:flushed')
  }

  async function doTicketRequest() {
    const token = ++ticketToken
    const uid = ident.userId.value
    const r = await iatTicket(uid, ident.token())
    if (token !== ticketToken) return // 迟到结果：作废（新一轮会话已开始）
    if (r.ok) dispatch('ticket:ok', { url: r.url, appId: r.appId })
    else dispatch('ticket:fail', { kind: r.reason })
  }

  function doWsConnect() {
    const st = state.value
    if (!st.ticket || ws) return
    let sock = null
    try {
      sock = new WebSocket(st.ticket.url)
    } catch {
      dispatch('ws:error')
      return
    }
    ws = sock
    parser = createParser()
    sock.onopen = () => dispatch('ws:open')
    sock.onmessage = (ev) => {
      // 官方契约：服务端**恒发 TextMessage**（且可能分帧）⇒ 非文本一律忽略
      if (typeof ev.data !== 'string') return
      const r = parser.push(ev.data)
      if (r.overflow) { dispatch('parser:overflow'); return }
      for (const msg of r.frames) dispatch('ws:msg', { msg })
    }
    sock.onerror = () => dispatch('ws:error')
    sock.onclose = (ev) => {
      if (ws === sock) ws = null
      dispatch('ws:close', { code: ev.code, clean: !!ev.wasClean })
    }
  }

  function doWsSend(kind, bytes) {
    if (!ws || ws.readyState !== 1) return
    const st = state.value
    const frame = buildFrame(kind, { appId: st.ticket ? st.ticket.appId : '', bytes })
    try {
      ws.send(JSON.stringify(frame))
    } catch {
      dispatch('ws:error')
    }
  }

  /** 主动关闭：**摘掉自身的 onclose**，避免「自己关的」又被当成服务端事件回灌状态机 */
  function doWsClose(code) {
    const sock = ws
    ws = null
    parser = null
    if (!sock) return
    try {
      sock.onopen = null
      sock.onmessage = null
      sock.onerror = null
      sock.onclose = null
      sock.close(code == null ? 1000 : code)
    } catch { /* 静默 */ }
  }

  function emitUi(ef) {
    if (ef.kind === 'success') {
      const t = String(ef.text || '').trim()
      if (t && typeof hooks.onResult === 'function') {
        try { hooks.onResult(t, { partial: !!ef.partial, under: !!ef.under }) } catch { /* 静默 */ }
      }
      if (ef.partial) console.warn('[xiaomu-iat] 结果为部分结果（超时或连接中断）')
      if (ef.under) console.warn('[xiaomu-iat] 判定为上游欠采（实收 << 应得）')
      return
    }
    if (ef.kind === 'failed') {
      // 401/403 属**配置级**：用户无法自救 ⇒ 文案已弱化，但**必须留痕**，否则线上排查无迹可循
      console.warn('[xiaomu-iat] 失败：', ef.failKind, ef.msg)
      if (typeof hooks.onFail === 'function') {
        try { hooks.onFail({ failKind: ef.failKind, msg: ef.msg }) } catch { /* 静默 */ }
      }
      return
    }
    if (ef.kind === 'quota') markQuotaExhausted()
  }

  /* ---------------- 额度前置拦截（⚠️ 只是 UX，不是安全边界） ---------------- */

  function localDay() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  function guardKey() {
    return quotaGuardKey(ident.userId.value, localDay())
  }
  function isQuotaExhausted() {
    try { return localStorage.getItem(guardKey()) === '1' } catch { return false }
  }
  function markQuotaExhausted() {
    try { localStorage.setItem(guardKey(), '1') } catch { /* 隐私模式：静默 */ }
  }
  function clearQuotaGuard() {
    try { localStorage.removeItem(guardKey()) } catch { /* 静默 */ }
  }

  /* ---------------- 对外入口（两个界面共用） ---------------- */

  /**
   * 按下。**真 PTT**：按住期间持续采集，松手才收尾。
   * @param {{onResult?:Function, onFail?:Function}} [opts]
   * @returns {boolean} 是否真的进入录音流程
   */
  function press(opts) {
    if (opts && typeof opts === 'object') {
      if (typeof opts.onResult === 'function') hooks.onResult = opts.onResult
      if (typeof opts.onFail === 'function') hooks.onFail = opts.onFail
    }
    if (!supported) return false
    if (!RETRYABLE.includes(state.value.phase)) return false // 流程中 / 不可重按态 ⇒ 忽略重复按下
    if (isQuotaExhausted()) { dispatch('quota:guard-hit'); return false } // 零资源消耗
    dispatch('ptt:down')
    return true
  }

  /** 松开（正常收尾） */
  function release() { dispatch('ptt:up') }

  /** 取消本次（Esc / 显式放弃）：不 flush、不发末帧、不入框 */
  function cancel() { dispatch('ptt:cancel') }

  /** 关闭提示条（denied / failed / empty / abandoned / success） */
  function dismiss() { dispatch('ui:dismiss') }

  /** 拆干净（离开页面 / 测试复位）。幂等。 */
  function reset() {
    ticketToken++
    if (timer) { clearTimeout(timer); timer = null }
    doWsClose(1001)
    try { mic.stop({ flushTail: false }) } catch { /* 静默 */ }
    try { voice.stop() } catch { /* 静默 */ }
    state.value = initialState()
    maxBufferDepthMs = 0
    hooks = { onResult: null, onFail: null }
  }

  /* 播报与录音互斥：录音期间**绝不开口**（防回授）。
   * 规则本体是 core 的纯函数 `suppressSpeech(state)`，这里只做执行。 */
  watch(() => voice.speaking.value, (on) => {
    if (on && suppressSpeech(state.value)) { try { voice.stop() } catch { /* 静默 */ } return }
    dispatch(on ? 'tts:start' : 'tts:end')
  })

  // 免打扰只影响「出声」，不影响「听话」（D5 管的是出声）
  watch(() => prefs.dnd, (on) => dispatch('dnd', { on }), { immediate: true })

  /* 切到后台/锁屏 ⇒ 音频不连续，**送半截音频比不送更糟**（改动清单 §4.2）：
   * `finalizing` 阶段不受影响（音频已采完，只等结果，core 里已注明）。
   * 本 composable 是**模块级单例**、随应用存活 ⇒ 监听器只挂一次，不提供卸载。 */
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) dispatch('visibility:hidden')
    })
  }

  /* Esc 取消：**必须有这条逃生通道** —— 真 PTT 是「按住」型交互，用户误按、
   * 或指针事件丢失（拖出窗口 / 系统弹窗）时若没有取消手段，会一直占着麦克风。
   * 只在会话进行中生效 ⇒ 不影响页面里其它 Esc 语义（不 preventDefault）。 */
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      if (state.value.phase === 'idle') return
      dispatch('ptt:cancel')
    })
  }

  shared = {
    // 只读状态
    state, phase, modifiers, level, text, failKind, notice,
    uiText, pttLabel, live, visible, dismissible, warn, supported,
    // 入口
    press, release, cancel, dismiss, reset,
    // 额度
    isQuotaExhausted, clearQuotaGuard,
    // 供界面与验收读
    MESSAGES, PTT_LABEL,
    /** 供验收/排查：本次会话观测到的最大缓冲深度（ms） */
    debug: () => ({ phase: state.value.phase, maxBufferDepthMs, ws: !!ws }),
  }
  return shared
}
