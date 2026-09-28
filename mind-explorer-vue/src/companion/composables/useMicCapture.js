/**
 * useMicCapture —— 麦克风采集（M6-2a，纯前端，零后端依赖）
 *
 * 把麦克风接成 **16k / 16bit / 单声道 / 小端 PCM 字节流**，每 ~40ms 回调一块，
 * 并持续回报归一化音量（驱动 §4.4 的波形动效）。
 *
 * 分工：
 *   · `public/worklets/pcm16.js`    —— 采样率转换核心（纯函数/纯类，可单测）
 *   · `public/worklets/pcm-capture.js` —— AudioWorkletProcessor（在音频线程跑）
 *   · 本文件 —— 主线程：申请权限、拼音频图、转发数据、负责拆干净
 *
 * 设计约束：
 *   1. **任何异常都不抛**（同 `api/xiaomuModel.js` / `useXiaomuVoice.js` 风格）——
 *      语音输入是加分项，出错必须给出可读提示、静默收场。
 *   2. **单例**（模块级共享）：同一时刻只能有一路麦克风，避免重复 `getUserMedia`
 *      导致设备被抢占、或两处各开一条管线。
 *   3. **按需启动**：不 import 就申请权限 —— 必须等用户真的点了「按住说话」才
 *      `getUserMedia`，否则一进页面就弹权限框（体验灾难，也过不了浏览器审计）。
 *   4. `stop()` 默认 **先 flush 再拆**：把不足一块的残尾样本也交出去，否则末尾
 *      最多 40ms 的音频被丢掉，最后一个字的声母可能被削。flush 用 worklet 的
 *      `flushed` ack 确认，不靠 sleep 猜。
 *   5. 音频图是 `source → node → destination`，但 worklet 输出**恒为静音**：
 *      既杜绝麦克风回授到扬声器，又保证节点被音频图持续驱动（零输出节点在某些
 *      浏览器里不保证被调度）。
 */
import { ref, readonly } from 'vue'

/** 目标格式（讯飞硬性要求；智谱 ASR 同样吃 16k PCM —— 这是最大公约数） */
export const TARGET_RATE = 16000

/** 可用性静态判定：需安全上下文 + getUserMedia + AudioWorklet */
export const micSupported = (() => {
  try {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return false
    if (typeof window.AudioWorkletNode !== 'function') return false
    const AC = window.AudioContext || window.webkitAudioContext
    // Safari 早期版本的 AudioContext 没有 audioWorklet，运行期还会再确认一次
    return !!AC && ('audioWorklet' in AC.prototype || true)
  } catch {
    return false
  }
})()

/* ---------------- 模块级单例状态 ---------------- */
const _active = ref(false)
const _level = ref(0)      // 0..1，归一化 RMS
const _inRate = ref(0)     // 实际 AudioContext.sampleRate（诊断用）
const _error = ref('')
const _muted = ref(false)

let ctx = null
let stream = null
let node = null
let src = null
let onChunkCb = null
let onLevelCb = null
let _flushWait = null      // flush() 的 resolve 挂在这

/** 把 getUserMedia / 音频管线的异常翻译成人话（小木的语气，不甩栈） */
function describeError(e) {
  const name = (e && e.name) || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '麦克风权限被拒绝了。去浏览器地址栏左边那把锁里，把麦克风改成「允许」就好。'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '没有找到可用的麦克风。'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风正被别的程序占着，先关掉它再试一次。'
  }
  if (name === 'OverconstrainedError') {
    return '这个麦克风不支持单声道采集。'
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return '当前页面不是 https（或 localhost），浏览器不允许使用麦克风。'
  }
  return '麦克风启动失败：' + ((e && e.message) || String(e))
}

function handlePort(e) {
  const d = (e && e.data) || {}
  if (d.t === 'pcm') {
    if (onChunkCb) { try { onChunkCb(d.bytes, d.rate) } catch { /* 回调异常不影响采集 */ } }
  } else if (d.t === 'level') {
    _level.value = d.rms
    if (onLevelCb) { try { onLevelCb(d.rms) } catch { /* ignore */ } }
  } else if (d.t === 'ready') {
    if (d.inRate) _inRate.value = d.inRate
  } else if (d.t === 'flushed') {
    const w = _flushWait
    _flushWait = null
    if (w) w(true)
  }
}

/** 拆干净：断开节点、停轨、关上下文。幂等，可重复调用。 */
async function teardown() {
  try { if (node) node.port.onmessage = null } catch { /* ignore */ }
  try { if (src) src.disconnect() } catch { /* ignore */ }
  try { if (node) node.disconnect() } catch { /* ignore */ }
  try { if (stream) stream.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
  try { if (ctx && ctx.state !== 'closed') await ctx.close() } catch { /* ignore */ }
  ctx = null; stream = null; node = null; src = null
  _active.value = false
  _level.value = 0
  _muted.value = false
  _flushWait = null
}

/**
 * 启动采集。
 * @param {{ onChunk?: (bytes: Uint8Array, rate: number) => void, onLevel?: (rms: number) => void }} [hooks]
 * @returns {Promise<boolean>} 是否启动成功（失败原因读 `error`）
 */
async function start(hooks = {}) {
  if (_active.value) return true
  _error.value = ''
  onChunkCb = hooks.onChunk || null
  onLevelCb = hooks.onLevel || null

  if (!micSupported) {
    _error.value = '这个浏览器不支持麦克风采集。'
    return false
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,          // 讯飞只收单声道
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
  } catch (e) {
    _error.value = describeError(e)
    return false
  }

  try {
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC()
    if (!ctx.audioWorklet) throw new Error('这个浏览器不支持 AudioWorklet')
    // 路径由 BASE_URL 拼出：dev 与 vite build 后都是 /worklets/…
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/pcm-capture.js`)

    src = ctx.createMediaStreamSource(stream)
    node = new window.AudioWorkletNode(ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { sampleRate: ctx.sampleRate, outRate: TARGET_RATE },
    })
    node.port.onmessage = handlePort
    src.connect(node)
    node.connect(ctx.destination)   // worklet 输出恒静音 → 不回授，但保证被调度

    _inRate.value = ctx.sampleRate
    _active.value = true
    // 某些浏览器首次创建 AudioContext 是 suspended（自动播放策略）
    if (ctx.state === 'suspended') { try { await ctx.resume() } catch { /* ignore */ } }
    return true
  } catch (e) {
    _error.value = describeError(e)
    await teardown()
    return false
  }
}

/**
 * 让 worklet 把不足一块的残尾样本发出来，并等它的 ack。
 * @param {number} [ackMs] 兜底超时（音频线程通常一个渲染量 ~2.7ms 内就回）
 * @returns {Promise<boolean>} 是否收到 ack
 */
function flush(ackMs = 150) {
  return new Promise((resolve) => {
    if (!node) return resolve(false)
    _flushWait = resolve
    setTimeout(() => {
      if (_flushWait === resolve) { _flushWait = null; resolve(false) }
    }, ackMs)
    try { node.port.postMessage({ t: 'flush' }) } catch { _flushWait = null; resolve(false) }
  })
}

/**
 * 停止采集。
 * @param {{ flushTail?: boolean }} [opts] 默认先把残尾交出去再拆
 */
async function stop(opts = {}) {
  const flushTail = opts.flushTail !== false
  if (flushTail && node) { try { await flush() } catch { /* ignore */ } }
  await teardown()
}

/** 临时静音（不停管线，避免反复开关设备的延迟）；同时把音量归零 */
function mute(v) {
  _muted.value = !!v
  if (node) { try { node.port.postMessage({ t: 'mute', value: !!v }) } catch { /* ignore */ } }
  if (_muted.value) _level.value = 0
}

export function useMicCapture() {
  return {
    supported: micSupported,
    active: readonly(_active),
    level: readonly(_level),
    sampleRate: readonly(_inRate),
    error: readonly(_error),
    muted: readonly(_muted),
    start,
    stop,
    flush,
    mute,
  }
}
