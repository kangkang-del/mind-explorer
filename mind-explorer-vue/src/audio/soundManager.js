/**
 * 心灵探索 · SoundManager —— 统一交互音效模块（V1.0 规范实现）
 *
 * 规范红线：
 * - 声音默认关闭，用户必须主动开启；偏好持久化到 localStorage，刷新不丢
 * - AudioContext 必须在用户手势中解锁（play 总是发生在点击里，天然满足；
 *   若 ctx 仍 suspended 则 resume，失败则本次静默跳过）
 * - 同一时刻最多播放一个音效（新音效先停掉旧的，不叠加）
 * - TTS 朗读期间抑制（setSuppressed 由 useXiaomuVoice 的 speaking 状态驱动）
 * - 加载失败 / 浏览器限制一律静默降级，绝不影响业务操作
 * - 紧急求助区域不接任何音效
 *
 * 音色（2026-11-13 用户定稿，Web Audio 实时合成，100% 原创，无素材文件）：
 * - tap        弱音琴点（880Hz 圆润音头 + 少量泛音）
 * - success    暖磬一记（523Hz 小磬 + 泛音余韵）
 * - transition 纸张翻动（两声极轻的带通颗粒）
 * - companion  风铃与暖底（低音垫 + 两颗高处风铃，小木专属提示音）
 */

const PREFS_KEY = 'xm.sound.prefs.v1'

const state = {
  enabled: false,   // 规范：首次访问默认关闭
  volume: 0.7,      // 0–1；总开关关闭时无效，音量 0 等同静音
  suppressed: false, // TTS 朗读中 → 抑制普通交互音
}

let ctx = null
let master = null
let active = new Set() // 当前在响的节点（防叠加用）

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return
    const p = JSON.parse(raw)
    if (typeof p.enabled === 'boolean') state.enabled = p.enabled
    if (typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1) state.volume = p.volume
  } catch { /* 静默降级：读不到就用默认（关） */ }
}
function persist() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: state.enabled, volume: state.volume })) } catch { /* 静默 */ }
}
loadPrefs()

/** 用户手势内的 AudioContext 获取/解锁；失败返回 null（本次静默） */
function ensureCtx() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = state.volume
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    if (ctx.state !== 'running') return null
    master.gain.value = state.volume
    return ctx
  } catch { return null }
}

/** 立即停止本模块所有在响声音（关开关 / 防叠加都会调） */
function stopAll() {
  for (const n of active) {
    try { n.stop(0) } catch { /* 已停则忽略 */ }
  }
  active.clear()
}

function tone(freq, t0, dur, peak, { glideTo = 0, type = 'sine' } = {}) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur * 0.9)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g); g.connect(master)
  o.start(t0); o.stop(t0 + dur + 0.05)
  active.add(o)
  o.onended = () => active.delete(o)
}

function noise(t0, dur, f0, f1, q, peak) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * (dur + 0.05)))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = ctx.createBufferSource()
  s.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = q
  bp.frequency.setValueAtTime(f0, t0)
  bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.3)
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur)
  s.connect(bp); bp.connect(g); g.connect(master)
  s.start(t0); s.stop(t0 + dur + 0.05)
  active.add(s)
  s.onended = () => active.delete(s)
}

/** 四个定稿音色的合成配方（参数与试听页 v1.1 完全一致） */
const recipes = {
  /** 弱音琴点：圆润音头 + 少量泛音，干净、轻、温柔 */
  tap() {
    const t = ctx.currentTime
    tone(880, t, 0.15, 0.28)
    tone(1760, t, 0.09, 0.05)
    tone(440, t, 0.12, 0.07)
  },
  /** 暖磬一记：低频小磬 + 泛音余韵（约 500ms，听感优先于规范时长） */
  success() {
    const t = ctx.currentTime
    tone(523.25, t, 0.5, 0.3)
    tone(1046.5, t, 0.36, 0.07)
    tone(1568, t, 0.22, 0.025)
  },
  /** 纸张翻动：两声极轻的带通颗粒 */
  transition() {
    const t = ctx.currentTime
    noise(t, 0.06, 1800, 900, 2.0, 0.18)
    noise(t + 0.09, 0.08, 1400, 700, 2.0, 0.14)
  },
  /** 风铃与暖底：低音垫 + 两颗高处风铃（小木专属，一次回复最多一次） */
  companion() {
    const t = ctx.currentTime
    tone(174.6, t, 0.42, 0.16)
    tone(1396.9, t + 0.07, 0.2, 0.13)
    tone(1661.2, t + 0.21, 0.24, 0.11)
  },
}

/**
 * 统一播放入口。play('tap'|'success'|'transition'|'companion')
 * - 未开启 / 被抑制（朗读中）/ AudioContext 不可用 → 静默跳过
 * - 任何异常都吞掉：音效永远不能影响业务
 */
export function play(name) {
  try {
    if (!state.enabled || state.suppressed) return
    const fn = recipes[name]
    if (!fn) return
    const c = ensureCtx()
    if (!c) return
    stopAll() // 同一时刻最多一个音效
    fn()
  } catch { /* 静默降级 */ }
}

/** 试听（设置页专用）：仅在总开关开启后可用（UI 侧禁用按钮，这里再兜一层） */
export function preview(name) {
  if (!state.enabled) return
  play(name)
}

/** TTS 朗读状态驱动：朗读中抑制普通交互音（由 useXiaomuVoice 挂接） */
export function setSuppressed(on) {
  state.suppressed = !!on
  if (state.suppressed) stopAll() // 规范：朗读开始立即压掉尚未播完的音效
}

export function isEnabled() { return state.enabled }
export function getVolume() { return state.volume }

export function setEnabled(on) {
  state.enabled = !!on
  if (!state.enabled) stopAll() // 规范：关闭后立即停止尚未播放完的音效
  persist()
}
export function setVolume(v) {
  const n = Math.min(1, Math.max(0, Number(v) || 0))
  state.volume = n
  if (master) { try { master.gain.value = n } catch { /* 静默 */ } }
  persist()
}
