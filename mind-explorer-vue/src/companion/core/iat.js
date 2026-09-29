/**
 * companion/core/iat.js —— 讯飞语音听写（IAT）的**纯逻辑核心**（M6-2c）
 *
 * 本文件是「语音输入」批次的**真源**：状态机、协议帧、流式解析、错误分型、欠采判定。
 * 里里外外**零 DOM / 零 Vue / 零 import** ⇒ Node 可直接 `import(file://…)` 做真源单测
 * （与 `core/storybook.js` / `public/worklets/pcm16.js` 同一手法，**不拷副本、不剥 import**）。
 *
 * 🔴 三条硬约束（见 `M6-2c-改动清单.md` §2.1）：
 *   1. `reduce()` 是**纯函数**，`event.at`（毫秒）**必带**，并返回 `nextWakeMs`（绝对时刻）。
 *      **本文件内禁止出现 `Date.now()` / `performance.now()`** —— 唯一时间源是编排层的 dispatch()。
 *      否则「25s 提示 / 30s 收尾 / 8s 超时」在 Node 里根本没法断言（会依赖真实时钟）。
 *   2. 副作用以**声明式 effect** 返回，由编排层执行 ⇒ 断言落在「**真正要做出去什么**」，
 *      而不是「返回 200」。本文件不碰 ws / mic / ui。
 *   3. 主状态机 **10 态**（设计清单的 9 态 + `abandoned`）：见 §4.4 映射与改动清单 §2.2。
 *
 * ⚠️ **不覆盖什么**（写清楚，免得把绿灯当全绿）：
 *   · 本文件的断言只证明「状态机与协议编解码**自洽**」，**不证明上游渲染/采集完整**
 *     （欠采需靠 §captureRatio + 浏览器层验收）；
 *   · `event.at` 由编排层提供，本文件**无法**验证它是否等于真实墙钟。
 *   · 手边没有真麦克风/真讯飞时，「250ms 延迟不损害体验」「MIN_MS=800 不误伤短句」仍是
 *     **待实测假设**（改动清单 §7）。
 *
 * 一手来源（外部契约必须能追到文档，否则就是未验证的实现）：
 *   《语音听写（流式版）WebAPI》
 *   https://www.xfyun.cn/doc/asr/voicedictation/API.html
 *     · §接口鉴权：签名与 authorization 两段式 base64（后端负责，见 content/index.js:voiceIatTicket）
 *     · §数据协议：首帧含 common/business、中间帧只含 data、末帧 status=2 且 audio 为空串
 *     · §音频要求：16k / 16bit / 单声道 PCM，单次 ≤ 60s，每帧约 40ms
 *     · §返回：**恒为 TextMessage，且可能分帧** ⇒ 必须累积 buffer 按 JSON 边界切
 *   （查阅日期 2026-09-29；本文引用的行号/字面量以该日版本为准）
 */

/* ================= 常量 ================= */

/** 采样率（讯飞硬性要求；与 M6-2a 的采集层一致，是「最大公约数」） */
export const RATE = 16000
/** 每样本字节数（16bit 单声道） */
export const BYTES_PER_SAMPLE = 2
/** 每秒字节数 = 32000；每毫秒 32 B。唱词/缓冲/欠采三个判据都用它 */
export const BYTES_PER_MS = (RATE * BYTES_PER_SAMPLE) / 1000
/** 帧里 data.format 的字面量（差一个字符讯飞就拒） */
export const AUDIO_FORMAT = 'audio/L16;rate=16000'

/** 按下后延迟多久才去签票 —— 让「按一下就松」的误触**零额度成本** */
export const ARM_DELAY_MS = 250
/** 最短有效时长：短于此判为误触 ⇒ `abandoned`（改动清单 §2.2） */
export const MIN_MS = 800
/** 接近上限提示阈值 */
export const NEAR_LIMIT_MS = 25000
/** 硬上限（讯飞单次 ≤60s，留 2× 余量） */
export const HARD_LIMIT_MS = 30000
/** 等讯飞结果的上限；超时不算失败：有部分结果就保留 */
export const TRANSCRIBE_TIMEOUT_MS = 8000
/**
 * 签票请求的超时。**取值理由（双边推导，避免又一个「说不出来源的数字」）**：
 *   · 下界：必须 ≥ p99(Edge 冷启动 + 用户网络) —— 否则正常路径被误判 failed(network)。
 *   · 上界：必须 ≤ 本文件里所有「放弃阈值」，否则这条守卫永不触发（死代码）。
 *   下界**编码期无法推导**（取决于 Supabase Edge 与用户网络）⇒ 暂定 8s，
 *   实际用到的等待时长由编排层 `observe.bufferDepth` 记录，**上线后按观测收敛**。
 */
export const TICKET_TIMEOUT_MS = 8000
/** 收尾阶段等 worklet flush ack 的保险丝（flush 自身 150ms 就回，这里只是兜底） */
export const FINALIZE_TIMEOUT_MS = 2000
/**
 * 票未到时的音频缓冲上限。**这里的单位是「内存」不是「延迟」**：
 *   32 B/ms ⇒ 3000ms ≈ 96 KB（可忽略），真正的约束来自 MAX 与 TICKET_TIMEOUT 的关系。
 *   ⚠️ **暂定值**：下界（必须 ≥ p99(ticket+WS 就绪)）编码期推导不出来 ⇒ 标为暂定，
 *      触发时打 observe 观测，上线后收敛。上界 check：3000 < TICKET_TIMEOUT_MS(8000) ✓ 可达。
 */
export const PENDING_MAX_MS = 3000
export const PENDING_MAX_BYTES = PENDING_MAX_MS * BYTES_PER_MS
/** 欠采阈值（与 M6-2a 的控制台 WARN 保持一致，便于对照） */
export const MIN_CAPTURE_RATIO = 0.9
/** 单个 JSON 解析 buffer 上限：编码错误会让 JSON 永不完整 ⇒ 必须封顶（否则无限增长） */
export const PARSER_MAX_BYTES = 64 * 1024
/** 结果状态的展示时长 */
export const SUCCESS_HOLD_MS = 1200
export const EMPTY_HOLD_MS = 1800
export const ABANDONED_HOLD_MS = 1800
export const FAILED_HOLD_MS = 5000

/** 主状态机（10 态） */
export const STATES = [
  'idle', 'arming', 'recording', 'finalizing', 'transcribing',
  'success', 'empty', 'abandoned', 'denied', 'failed',
]
/** 与主状态机**正交**的叠加修饰（不是并列状态） */
export const MODIFIERS = ['nearLimit', 'speaking', 'dnd']

/** 按 uid 的本地自然日做键的额度前置拦截 —— ⚠️ **只是 UX 优化，不是安全边界** */
export const QUOTA_GUARD_PREFIX = 'xm.iatQuota'

/** 界面文案（收在一处：对话页与桌宠两个入口共用，避免两处各写一遍） */
export const MESSAGES = {
  arming: '准备好，马上就好…',
  recording: '我在听…松开发送',
  nearLimit: '慢慢说，我快听满了',
  finalizing: '听完了，我理一理…',
  transcribing: '小木在想…',
  success: '听到了',
  empty: '木有听清呢，再说一次好吗？',
  abandoned: '太短了，按住多说一会儿',
  autoStop: '先听到这儿，剩下的我们接着聊',
  denied: '麦克风还没打开呢。去浏览器地址栏左边那把锁里，把麦克风改成「允许」就好。',
  'failed.config': '语音服务暂时不可用',
  'failed.clock': '你设备的时间好像不准，校一下再试试？',
  'failed.network': '网络好像不太稳，再试一次？',
  'failed.unsupported': '语音输入还没开启',
  'failed.biz': '刚才没听清，再说一次好吗？',
  quota: '今天的语音次数用完了。想继续说，可以填你自己的密钥（即将开放）。',
  partial: '刚才网络断了，只听到这些',
  underCapture: '刚才好像漏听了一小段，再说一次好吗？',
}
/** PTT 按钮文案（由 idle↔recording 直接驱动） */
export const PTT_LABEL = { idle: '按住说话', recording: '松开发送' }

/* ================= base64 ================= */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INV = (() => {
  const m = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) m[B64.charCodeAt(i)] = i
  return m
})()

/**
 * Uint8Array → 标准 base64（带 `=` 补齐）。
 * 手写而不用 `btoa`：本文件要能在 Node 与浏览器**同一份代码**下跑，
 * 且 `String.fromCharCode(...bigArray)` 在大数组上会爆栈。
 */
export function bytesToBase64(bytes) {
  const n = bytes ? bytes.length : 0
  if (!n) return ''
  let out = ''
  for (let i = 0; i < n; i += 3) {
    const b0 = bytes[i]
    const has1 = i + 1 < n
    const has2 = i + 2 < n
    const b1 = has1 ? bytes[i + 1] : 0
    const b2 = has2 ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += has1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += has2 ? B64[b2 & 63] : '='
  }
  return out
}

/** base64 → Uint8Array（单测用；也便于「改一字节 ⇒ 结果必须不同」的对照断言） */
export function base64ToBytes(s) {
  const clean = String(s == null ? '' : s).replace(/=+$/, '')
  const n = clean.length
  if (!n) return new Uint8Array(0)
  const out = new Uint8Array(Math.floor((n * 6) / 8))
  let o = 0
  let buf = 0
  let bits = 0
  for (let i = 0; i < n; i++) {
    const v = B64_INV[clean.charCodeAt(i)]
    if (v < 0) throw new Error('base64ToBytes: 非法字符')
    buf = ((buf << 6) | v) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buf >> bits) & 0xff
    }
  }
  return out
}

/* ================= 协议帧 ================= */

/**
 * 首帧：**同时**带 common.app_id 与 business 参数。
 * @param {string} appId 由后端 `voice.iatTicket` 返回（前端拿不到 apiKey/apiSecret）
 * @param {Uint8Array} [audioBytes] 首块音频（可为空：WS 先开、第一块音频随后到）
 */
export function buildFirstFrame(appId, audioBytes) {
  return {
    common: { app_id: String(appId == null ? '' : appId) },
    business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', vad_eos: 2000, vinfo: 0 },
    data: { status: 0, format: AUDIO_FORMAT, encoding: 'raw', audio: bytesToBase64(audioBytes) },
  }
}

/** 中间帧：**只含 data**（再带 common/business 会被拒） */
export function buildMiddleFrame(audioBytes) {
  return { data: { status: 1, format: AUDIO_FORMAT, encoding: 'raw', audio: bytesToBase64(audioBytes) } }
}

/** 末帧：status=2 且 audio 为**空串** */
export function buildFinalFrame() {
  return { data: { status: 2, format: AUDIO_FORMAT, encoding: 'raw', audio: '' } }
}

/** 按 kind 造帧（编排层用；让「造了什么帧」只有一个出口，便于断言） */
export function buildFrame(kind, { appId, bytes } = {}) {
  if (kind === 'first') return buildFirstFrame(appId, bytes)
  if (kind === 'middle') return buildMiddleFrame(bytes)
  if (kind === 'final') return buildFinalFrame()
  throw new Error(`buildFrame: 未知 kind ${kind}`)
}

/* ================= 流式解析 ================= */

/**
 * 从 buffer 里摘出**第一个完整的顶层 JSON 对象**。
 * 用花括号深度 + 字符串/转义状态机扫描，**不是**按 `}` 硬切
 * —— 讯飞返回的文本里含 `}` 或转义引号是常态。
 * @returns {{text:string,end:number}|null} null = 还不完整（继续等下一片）
 */
export function scanOneJson(str) {
  const n = str.length
  let i = 0
  while (i < n && str[i] !== '{') i++
  if (i >= n) return null
  const start = i
  let depth = 0
  let inStr = false
  let esc = false
  for (; i < n; i++) {
    const c = str[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { text: str.slice(start, i + 1), end: i + 1 }
    }
  }
  return null
}

/**
 * 分帧解析器：**不假设「一帧一个完整 JSON」**（官方明确可能分帧）。
 * `push(str) → { frames:[…], overflow:bool }`
 * · 一次 push 可能吐出 0 个（半截）、1 个、或多个（粘连）帧；
 * · buffer 超过 `maxBytes` ⇒ `overflow=true` 并清空（编码错误会让 JSON 永不完整，
 *   不封顶就是内存泄漏）。
 */
export function createParser({ maxBytes = PARSER_MAX_BYTES } = {}) {
  let buf = ''
  let overflow = false
  function push(chunk) {
    const frames = []
    if (chunk) buf += chunk
    while (!overflow) {
      const r = scanOneJson(buf)
      if (!r) break
      buf = buf.slice(r.end)
      try {
        frames.push(JSON.parse(r.text))
      } catch {
        /* 半个坏帧不致命：丢掉、继续（同一条流后面还有帧） */
      }
    }
    if (buf.length > maxBytes) {
      overflow = true
      buf = ''
    }
    return { frames, overflow }
  }
  return {
    push,
    reset() { buf = ''; overflow = false },
    get overflow() { return overflow },
    get buffered() { return buf.length },
  }
}

/**
 * 取一条返回帧里的识别文本（逐片追加语义）。
 * `data.result.ws[].cw[].w`；空 `ws` / 空 `cw` / 缺字段都必须安全。
 */
export function collectText(msg) {
  try {
    const d = msg && msg.data
    if (!d) return ''
    const r = d.result
    if (!r || !Array.isArray(r.ws)) return ''
    let s = ''
    for (const w of r.ws) {
      if (w && Array.isArray(w.cw)) {
        for (const c of w.cw) if (c && typeof c.w === 'string') s += c.w
      }
    }
    return s
  } catch {
    return ''
  }
}

/* ================= 错误分型 ================= */

/**
 * 握手失败分型。401×3 与 403 都属**配置级**（用户无法自救 ⇒ 文案要弱化，
 * 但**必须**在编排层打 `console.warn`，否则线上排查无迹可循）。
 * @param {number} status HTTP/WS 握手状态（0 = 连不上）
 * @param {string} [bodyText] 响应体/close reason
 * @returns {'config'|'clock'|'network'}
 */
export function classifyHandshake(status, bodyText) {
  const body = String(bodyText || '')
  if (status === 401) return 'config' // Unauthorized / HMAC signature cannot be verified / does not match
  if (status === 403) {
    // 403 = 时钟偏移（date 超出 ±300s）或 IP 白名单；前者用户可自救，后者是部署配置问题
    if (/time|date|clock|expire|offset|not allowed|ip/i.test(body)) {
      return /not allowed|ip/i.test(body) ? 'config' : 'clock'
    }
    return 'config'
  }
  if (!status || status >= 500) return 'network'
  return 'config'
}

/** 讯飞业务码分型：0 = 正常；其余一律 `biz`（原始码留在日志里） */
export function classifyBusiness(code) {
  if (code === 0 || code == null) return ''
  return 'biz'
}

/* ================= 欠采判定 ================= */

/**
 * 采集完整性：`实收字节 / 应得字节`。
 * 🔴 计时基准必须是「**首个音频块 → 末块**」，**不能**是「按下 → 松开」
 *    —— 后者把 `arming` 阶段的等待算进分母，造成**系统性低报**
 *    （正是 M6-2a 墙钟坑的同款错误）。
 */
export function captureRatio({ bytes = 0, firstAtMs = 0, lastAtMs = 0 } = {}) {
  const span = lastAtMs - firstAtMs
  if (!(span > 0)) return bytes > 0 ? 1 : 0
  const expected = span * BYTES_PER_MS
  return expected > 0 ? bytes / expected : 0
}

/* ================= 状态机 ================= */

/** 全新的一次会话（**不改叠加修饰**：dnd 是跨会话的） */
export function initialState() {
  return {
    phase: 'idle',
    modifiers: { nearLimit: false, speaking: false, dnd: false },
    at: 0,
    t0: 0,              // 本次 ptt:down 时刻
    delayFired: false,  // 250ms 定时器是否已到（决定「误触是否已消耗额度」）
    micReady: false,
    ticketRequested: false,
    ticket: null,       // { url, appId } —— 签票成功后的凭据
    wsOpen: false,
    pending: [],        // Uint8Array[]：票未到时的音频缓冲
    framesSent: 0,
    bytes: 0,           // 累计收到的 PCM 字节
    firstChunkAt: 0,
    lastChunkAt: 0,
    recStartAt: 0,
    finStartAt: 0,
    transStartAt: 0,
    flushDone: false,
    wsFinal: false,     // 收到过 status=2 的最终结果
    abnormal: false,    // WS 异常结束（网络断/错误）——决定「空结果」是 empty 还是 failed
    text: '',
    partial: false,
    under: false,       // 上游欠采
    failKind: '',
    releaseAt: 0,       // 本次 ptt:up 时刻（0 = 仍按着）
    holdUntil: 0,
    notice: '',         // 不属于任何 phase 的一次性提示（如 quota 引导）
  }
}

function clone(s) {
  return { ...s, modifiers: { ...s.modifiers } }
}

function pendingBytes(s) {
  let n = 0
  for (const b of s.pending) n += b.length
  return n
}

/** 进入一次新会话（ptt:down）：只重置会话字段，不动叠加修饰 */
function freshSession(s, at) {
  return {
    ...s,
    phase: 'arming',
    t0: at,
    delayFired: false,
    micReady: false,
    ticketRequested: false,
    ticket: null,
    wsOpen: false,
    pending: [],
    framesSent: 0,
    bytes: 0,
    firstChunkAt: 0,
    lastChunkAt: 0,
    recStartAt: 0,
    finStartAt: 0,
    transStartAt: 0,
    flushDone: false,
    wsFinal: false,
    abnormal: false,
    text: '',
    partial: false,
    under: false,
    failKind: '',
    releaseAt: 0,
    holdUntil: 0,
    notice: '',
    modifiers: { ...s.modifiers, nearLimit: false },
  }
}

/** 收尾裁决点：**按「收到的 PCM 时长」判**，不是按「按下总时长」 */
function isTooShort(s) {
  return s.bytes / BYTES_PER_MS < MIN_MS
}

/**
 * 计算下一个需要 tick 的**绝对时刻**（null = 无需定时器）。
 * 编排层据此只起**一个**定时器 ⇒ 「谁提供现在几点」这个问题只有一个答案。
 */
export function nextDeadline(s) {
  switch (s.phase) {
    case 'arming': {
      if (!s.delayFired) return s.t0 + ARM_DELAY_MS
      // 票在飞 → 超时兜底。⚠️ 麦克风侧**不设墙钟放弃**：权限弹窗可能被用户挂着很久，
      //    拒绝会以 mic:error(NotAllowed) 明确到达，不需要靠时间猜。
      if (s.ticketRequested && !s.ticket) return s.t0 + ARM_DELAY_MS + TICKET_TIMEOUT_MS
      return null
    }
    case 'recording': {
      const base = s.recStartAt || s.t0
      return s.modifiers.nearLimit ? base + HARD_LIMIT_MS : base + NEAR_LIMIT_MS
    }
    case 'finalizing': return s.finStartAt + FINALIZE_TIMEOUT_MS
    case 'transcribing': return s.transStartAt + TRANSCRIBE_TIMEOUT_MS
    case 'success':
    case 'empty':
    case 'abandoned':
    case 'failed': return s.holdUntil || null
    default: return null
  }
}

function done(s, effects) {
  return { state: s, effects, nextWakeMs: nextDeadline(s) }
}

/** 进入带自动停留的状态（success/empty/abandoned/failed） */
function hold(s, phase, holdMs, at, effects) {
  s.phase = phase
  s.holdUntil = at + holdMs
  return done(s, effects)
}

/** 收尾：把缓冲里剩下的音频排成帧（first 只可能是第一帧） */
function frameEffects(s, list, isFirstEver) {
  const out = []
  let first = isFirstEver
  for (const b of list) {
    out.push({ type: 'ws.send', kind: first ? 'first' : 'middle', bytes: b })
    first = false
  }
  return out
}

/** ws:open 的公共处理（recording / finalizing 共用） */
function onWsOpen(s, at, effects) {
  s.wsOpen = true
  const wasFirstEver = s.framesSent === 0
  if (s.pending.length) {
    effects.push(...frameEffects(s, s.pending, wasFirstEver))
    s.framesSent += s.pending.length
    s.pending = []
  }
  // 若已经收完尾了（用户在 WS 建连期间就松手）→ 直接补发末帧
  if (s.flushDone && s.phase === 'finalizing') {
    effects.push({ type: 'ws.send', kind: 'final' })
    s.phase = 'transcribing'
    s.transStartAt = at
    effects.push({ type: 'ui.emit', kind: 'transcribing' })
    if (s.wsFinal) settle(s, at, effects)
  }
  return effects
}

/** 结算：有文本 → success；否则按 abnormal 判 empty / failed */
function settle(s, at, effects) {
  effects.push({ type: 'ws.close', code: 1000 }) // 已拿到结论（或已超时）⇒ 不再留着连接
  effects.push({ type: 'mic.stop', flushTail: false })
  s.pending = []
  const text = s.text.trim()
  if (text) {
    s.phase = 'success'
    s.holdUntil = at + SUCCESS_HOLD_MS
    effects.push({ type: 'ui.emit', kind: 'success', text, partial: s.partial, under: s.under })
    return done(s, effects)
  }
  if (s.abnormal) {
    s.failKind = 'network'
    effects.push({ type: 'ui.emit', kind: 'failed', failKind: 'network', msg: MESSAGES['failed.network'] })
    return hold(s, 'failed', FAILED_HOLD_MS, at, effects)
  }
  effects.push({ type: 'ui.emit', kind: 'empty' })
  return hold(s, 'empty', EMPTY_HOLD_MS, at, effects)
}

function fail(s, at, kind, effects, extraEffect) {
  s.failKind = kind
  s.pending = []
  if (extraEffect) effects.push(extraEffect)
  effects.push({ type: 'ws.close', code: 1001 })
  effects.push({ type: 'mic.stop', flushTail: false })
  effects.push({ type: 'ui.emit', kind: 'failed', failKind: kind, msg: MESSAGES[`failed.${kind}`] || MESSAGES['failed.network'] })
  return hold(s, 'failed', FAILED_HOLD_MS, at, effects)
}

/** 放弃（票已签但音频不足 / 取消 / 中断）：关掉一切，不送末帧 */
function abort(s, at, phase, effects, closeCode) {
  s.phase = phase
  effects.push({ type: 'ws.close', code: closeCode })
  effects.push({ type: 'mic.stop', flushTail: false })
  s.pending = []
  return done(s, effects)
}

/**
 * 灰色地带：票已签、额度已扣，但收到的音频不足 `MIN_MS` ⇒ `abandoned`。
 * 🔴 **不发末帧**（不消耗讯飞每日额度），但**必须关干净**：
 *   早期版本只 emit 了 `abandoned` 就 `hold()`，结果**麦克风一直热着、WS 也挂着**
 *   —— 用户看到「太短了」以为结束了，实际还在录（隐私 + 电量 + 占设备）。
 *   Chromium 浏览器层验收实测到该泄漏（`wsClosed=[null,null]`、`bytes` 持续增长）。
 */
function abandonTooShort(s, at, effects) {
  effects.push({ type: 'ws.close', code: 1001 })
  effects.push({ type: 'mic.stop', flushTail: false })
  s.pending = []
  effects.push({ type: 'ui.emit', kind: 'abandoned' })
  return hold(s, 'abandoned', ABANDONED_HOLD_MS, at, effects)
}

/**
 * 状态机核心。
 * @param {object} state 上一状态（不得就地修改）
 * @param {{type:string, at:number, [k:string]:any}} event 🔴 `at`（毫秒）**必带**
 * @returns {{state:object, effects:Array, nextWakeMs:number|null}}
 */
export function reduce(state, event) {
  const at = event && event.at
  if (typeof at !== 'number' || !Number.isFinite(at)) {
    // 契约违例 = 编码错误，直接抛（调用方是编排层的 dispatch，唯一时间源）
    throw new TypeError('iat.reduce: event.at (ms) 必带且必须是有限数')
  }
  const s = clone(state)
  s.at = at
  const effects = []
  const type = event && event.type

  /* ---- 与主状态机正交的修饰：任何状态下都只改修饰，不改 phase ---- */
  if (type === 'dnd') { s.modifiers.dnd = !!event.on; return done(s, effects) }
  if (type === 'tts:start') { s.modifiers.speaking = true; return done(s, effects) }
  if (type === 'tts:end') { s.modifiers.speaking = false; return done(s, effects) }
  if (type === 'ui:dismiss') {
    s.notice = ''
    if (s.phase === 'denied' || s.phase === 'failed' || s.phase === 'abandoned' ||
        s.phase === 'empty' || s.phase === 'success') {
      s.phase = 'idle'
      s.holdUntil = 0
    }
    return done(s, effects)
  }

  switch (s.phase) {
    /* ============ idle ============ */
    case 'idle': {
      if (type === 'ptt:down') {
        // 播报中按下 = 不想听了 ⇒ 先掐断播报（顺手消灭「录到自己声音」的回授路径）
        if (s.modifiers.speaking) effects.push({ type: 'voice.stop' })
        const r = done(freshSession(s, at), effects)
        r.effects.push({ type: 'mic.start' })
        return r
      }
      if (type === 'quota:guard-hit') {
        s.notice = 'quota'
        effects.push({ type: 'ui.emit', kind: 'quota' })
        return done(s, effects)
      }
      // 迟到结果：**必须回收资源**，不能让它「复活」一个已结束的会话
      if (type === 'ws:open' || type === 'ws:msg' || type === 'ws:error' || type === 'ws:close') {
        effects.push({ type: 'ws.close', code: 1000 })
        return done(s, effects)
      }
      if (type === 'mic:ready' || type === 'mic:chunk' || type === 'mic:flushed' ||
          type === 'ticket:ok' || type === 'ticket:fail') {
        effects.push({ type: 'mic.stop', flushTail: false })
        return done(s, effects)
      }
      return done(s, effects)
    }

    /* ============ arming（已按下、尚未就绪） ============ */
    case 'arming': {
      if (type === 'mic:ready') {
        s.micReady = true
        if (s.releaseAt && isTooShort(s)) {
          // 松手时票已签（额度已扣）但音频根本不够 ⇒ 灰色地带
          return abandonTooShort(s, at, effects)
        }
        if (s.ticket) return startRecording(s, at, effects)
        return done(s, effects)
      }
      if (type === 'mic:error') {
        const name = String(event.name || '')
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          s.phase = 'denied'
          effects.push({ type: 'mic.stop', flushTail: false })
          effects.push({ type: 'ui.emit', kind: 'denied' })
          return done(s, effects)
        }
        return fail(s, at, 'unsupported', effects)
      }
      if (type === 'ticket:ok') {
        s.ticket = { url: event.url, appId: event.appId }
        if (s.releaseAt && isTooShort(s)) return abandonTooShort(s, at, effects)
        if (s.micReady) return startRecording(s, at, effects)
        return done(s, effects)
      }
      if (type === 'ticket:fail') {
        const kind = event.kind === 'unsupported' ? 'unsupported' : event.kind === 'quota' ? 'quota' : 'network'
        if (kind === 'quota') {
          // D16：额度用完 → 引导（留在 idle，不占 phase）
          s.phase = 'idle'
          s.notice = 'quota'
          effects.push({ type: 'mic.stop', flushTail: false })
          effects.push({ type: 'ui.emit', kind: 'quota' })
          return done(s, effects)
        }
        return fail(s, at, kind, effects)
      }
      if (type === 'ptt:up' || type === 'ptt:cancel') {
        if (!s.delayFired) {
          // 🔴 唯一成立的「零额度成本」：250ms 内松手 ⇒ ticket 请求从未发出
          s.phase = 'idle'
          effects.push({ type: 'mic.stop', flushTail: false })
          return done(s, effects)
        }
        if (type === 'ptt:cancel') {
          effects.push({ type: 'ui.emit', kind: 'idle' })
          return abort(s, at, 'idle', effects, 1001)
        }
        s.releaseAt = at
        if (isTooShort(s)) {
          // 票已签、额度已扣、音频不足 ⇒ abandoned（**不发末帧**，不消耗讯飞额度）
          return abandonTooShort(s, at, effects)
        }
        // 音频够了但还没进 recording：等 mic:ready / ticket:ok 到位后立刻收尾
        return done(s, effects)
      }
      if (type === 'visibility:hidden' || type === 'track:ended') {
        effects.push({ type: 'ui.emit', kind: 'idle' })
        return abort(s, at, 'idle', effects, 1001)
      }
      if (type === 'tick') {
        if (!s.delayFired && at >= s.t0 + ARM_DELAY_MS) {
          s.delayFired = true
          s.ticketRequested = true
          effects.push({ type: 'ticket.request' })
          return done(s, effects)
        }
        if (s.ticketRequested && !s.ticket && at >= s.t0 + ARM_DELAY_MS + TICKET_TIMEOUT_MS) {
          return fail(s, at, 'network', effects)
        }
        return done(s, effects)
      }
      return done(s, effects)
    }

    /* ============ recording ============ */
    case 'recording': {
      if (type === 'mic:chunk') return pushChunk(s, at, event, effects, 'recording')
      if (type === 'ptt:down') return done(s, effects) // 第二次按下：忽略（防重复触发）
      if (type === 'ptt:up') return finishAtRelease(s, at, effects)
      if (type === 'ptt:cancel') {
        effects.push({ type: 'ui.emit', kind: 'idle' })
        return abort(s, at, 'idle', effects, 1001)
      }
      if (type === 'visibility:hidden' || type === 'track:ended') {
        // 音频不连续 ⇒ 送半截比不送更糟
        effects.push({ type: 'ui.emit', kind: 'idle' })
        return abort(s, at, 'idle', effects, 1001)
      }
      if (type === 'ws:open') { onWsOpen(s, at, effects); return done(s, effects) }
      if (type === 'ws:msg') return onWsMsg(s, at, event, effects)
      if (type === 'ws:error') {
        s.abnormal = true
        if (s.text.trim()) return toTranscribing(s, at, effects, true)
        return fail(s, at, 'network', effects)
      }
      if (type === 'ws:close') {
        if (!event.clean) s.abnormal = true
        if (s.text.trim()) return toTranscribing(s, at, effects, true)
        if (s.abnormal) return fail(s, at, 'network', effects)
        return toTranscribing(s, at, effects, false)
      }
      if (type === 'parser:overflow') return fail(s, at, 'network', effects)
      if (type === 'tick') {
        const base = s.recStartAt || s.t0
        // ⚠️ 先判硬上限：30s 的那一次 tick 必然也满足 25s 条件，
        //    若先判 nearLimit 就会被它「截胡」而永远走不到自动收尾（实测踩过）。
        if (at >= base + HARD_LIMIT_MS) {
          // 自动收尾（文案有别于用户主动松手）
          effects.push({ type: 'ui.emit', kind: 'autoStop' })
          return toFinalizing(s, at, effects)
        }
        if (!s.modifiers.nearLimit && at >= base + NEAR_LIMIT_MS) {
          s.modifiers.nearLimit = true
          effects.push({ type: 'ui.emit', kind: 'nearLimit' })
          return done(s, effects)
        }
        return done(s, effects)
      }
      return done(s, effects)
    }

    /* ============ finalizing（本地收尾：flush 残尾 + 末帧） ============ */
    case 'finalizing': {
      if (type === 'mic:chunk') return pushChunk(s, at, event, effects, 'finalizing')
      if (type === 'mic:flushed') {
        s.flushDone = true
        if (s.wsOpen) {
          effects.push({ type: 'ws.send', kind: 'final' })
          return toTranscribing(s, at, effects, s.partial)
        }
        return done(s, effects) // 等 ws:open（有超时兜底）
      }
      if (type === 'ws:open') { onWsOpen(s, at, effects); return done(s, effects) }
      if (type === 'ws:msg') return onWsMsg(s, at, event, effects)
      if (type === 'ws:error') {
        s.abnormal = true
        if (s.text.trim()) return toTranscribing(s, at, effects, true)
        return fail(s, at, 'network', effects)
      }
      if (type === 'ws:close') {
        if (!event.clean) s.abnormal = true
        if (s.text.trim()) return toTranscribing(s, at, effects, true)
        if (s.abnormal) return fail(s, at, networkKindOf(s), effects)
        return toTranscribing(s, at, effects, false)
      }
      if (type === 'parser:overflow') return fail(s, at, 'network', effects)
      if (type === 'ptt:cancel') {
        effects.push({ type: 'ui.emit', kind: 'idle' })
        return abort(s, at, 'idle', effects, 1001)
      }
      // ℹ️ visibility:hidden 在 finalizing **不中断**：音频已采完，只等结果
      if (type === 'tick') {
        if (at >= s.finStartAt + FINALIZE_TIMEOUT_MS) {
          // flush ack 没回来（worklet 异常）→ 不等了，直接补末帧进转写等待
          if (s.wsOpen) effects.push({ type: 'ws.send', kind: 'final' })
          return toTranscribing(s, at, effects, true)
        }
        return done(s, effects)
      }
      return done(s, effects)
    }

    /* ============ transcribing（等讯飞结果） ============ */
    case 'transcribing': {
      if (type === 'ws:open') {
        // 迟到/重复的 open：直接关掉（结果已经在路上或已到）
        effects.push({ type: 'ws.close', code: 1000 })
        return done(s, effects)
      }
      if (type === 'ws:msg') return onWsMsg(s, at, event, effects)
      if (type === 'ws:close') {
        if (!event.clean) s.abnormal = true
        return settle(s, at, effects)
      }
      if (type === 'ws:error') { s.abnormal = true; return settle(s, at, effects) }
      if (type === 'parser:overflow') { s.abnormal = true; return settle(s, at, effects) }
      if (type === 'tick') {
        if (at >= s.transStartAt + TRANSCRIBE_TIMEOUT_MS) {
          // 超时不算「失败」，但**算异常**：讯飞该回没回（§4.3 与「网络中断」同一行）。
          // 有部分结果就保留（走 success）；一个字都没拿到 ⇒ failed(network)，
          // 因为此时「听清了但没识别出内容」这个解释站不住（连末帧都没等到）。
          s.partial = true
          s.abnormal = true
          return settle(s, at, effects)
        }
        return done(s, effects)
      }
      if (type === 'ptt:down') {
        // 用户说第二句 ≠ 要丢第一句 ⇒ 先入框，再开新会话
        const text = s.text.trim()
        if (text) effects.push({ type: 'ui.emit', kind: 'success', text, partial: true, under: s.under })
        effects.push({ type: 'ws.close', code: 1000 })
        if (s.modifiers.speaking) effects.push({ type: 'voice.stop' })
        const r = done(freshSession(s, at), effects)
        r.effects.push({ type: 'mic.start' })
        return r
      }
      if (type === 'ptt:cancel') {
        effects.push({ type: 'ui.emit', kind: 'idle' })
        return abort(s, at, 'idle', effects, 1001)
      }
      return done(s, effects)
    }

    /* ============ success / empty / abandoned / denied / failed ============ */
    case 'success':
    case 'empty':
    case 'abandoned':
    case 'failed': {
      if (type === 'ptt:down') {
        effects.push({ type: 'ws.close', code: 1000 })
        if (s.modifiers.speaking) effects.push({ type: 'voice.stop' })
        const r = done(freshSession(s, at), effects)
        r.effects.push({ type: 'mic.start' })
        return r
      }
      if (type === 'tick' && s.holdUntil && at >= s.holdUntil) {
        s.phase = 'idle'
        s.holdUntil = 0
        return done(s, effects)
      }
      return done(s, effects)
    }

    default:
      return done(s, effects)
  }
}

function networkKindOf() { return 'network' }

/** 收到一块 PCM：计入字节数，按「WS 是否已开」决定直发还是入缓冲 */
function pushChunk(s, at, event, effects, phase) {
  const bytes = event.bytes
  const len = bytes ? bytes.length : (event.byteLength || 0)
  if (!len) return done(s, effects)
  s.bytes += len
  if (!s.firstChunkAt) s.firstChunkAt = at
  s.lastChunkAt = at

  if (s.wsOpen) {
    effects.push({ type: 'ws.send', kind: s.framesSent === 0 ? 'first' : 'middle', bytes })
    s.framesSent++
    return done(s, effects)
  }
  s.pending = [...s.pending, bytes]
  const buffered = pendingBytes(s)
  effects.push({ type: 'observe.bufferDepth', ms: Math.round(buffered / BYTES_PER_MS) })
  if (buffered > PENDING_MAX_BYTES) {
    // 票/WS 迟迟不就绪，缓冲触顶 ⇒ 放弃本次（防内存膨胀、也防「送一段过时音频」）
    return fail(s, at, 'network', effects)
  }
  if (phase === 'finalizing' && s.flushDone) {
    // 已收完尾却还没连上 ⇒ 只能等（有超时兜底）
    return done(s, effects)
  }
  return done(s, effects)
}

/** arming → recording */
function startRecording(s, at, effects) {
  s.phase = 'recording'
  s.recStartAt = at
  s.modifiers.nearLimit = false
  effects.push({ type: 'ws.connect' })
  effects.push({ type: 'ui.emit', kind: 'recording' })
  if (s.releaseAt) return finishAtRelease(s, at, effects)
  return done(s, effects)
}

/** 松手收尾裁决 */
function finishAtRelease(s, at, effects) {
  s.releaseAt = at
  s.under = captureRatio({ bytes: s.bytes, firstAtMs: s.firstChunkAt, lastAtMs: s.lastChunkAt }) < MIN_CAPTURE_RATIO
  if (isTooShort(s)) {
    // 灰色地带：票已签、额度已扣、音频不足 ⇒ 不发末帧
    return abandonTooShort(s, at, effects)
  }
  effects.push({ type: 'ui.emit', kind: 'finalizing' })
  return toFinalizing(s, at, effects)
}

/** 进入 finalizing：让 worklet 交出残尾并停采集（`mic:flushed` 回来时再发末帧） */
function toFinalizing(s, at, effects) {
  s.phase = 'finalizing'
  s.finStartAt = at
  s.flushDone = false
  // 用 `mic.stop{flushTail:true}` 一步到位：useMicCapture 的 stop 会先 flush（等 worklet 的
  // flushed ack，残尾样本在 ack **之前**发出）再 teardown ⇒ 编排层 await 之后派发 mic:flushed。
  effects.push({ type: 'mic.stop', flushTail: true })
  return done(s, effects)
}

/** 进入 transcribing（= 已发末帧，等结果） */
function toTranscribing(s, at, effects, partial) {
  s.phase = 'transcribing'
  s.transStartAt = at
  s.partial = !!partial
  // 兜底关麦：从 recording 被 ws:error 直接打到 transcribing 时，用户可能**还按着**，
  // 不关就是一路漏采。teardown 幂等，正常路径（已经 mic.stop 过）再调一次无副作用。
  effects.push({ type: 'mic.stop', flushTail: false })
  effects.push({ type: 'ui.emit', kind: 'transcribing' })
  if (s.wsFinal) return settle(s, at, effects)
  return done(s, effects)
}

/** 处理一条已解析的返回帧 */
function onWsMsg(s, at, event, effects) {
  const msg = event.msg || {}
  const code = typeof msg.code === 'number' ? msg.code : 0
  const t = collectText(msg)
  if (t) s.text += t
  if (code !== 0) s.failKind = classifyBusiness(code)

  const status = msg.data && msg.data.status
  if (status === 2) s.wsFinal = true

  if (s.phase === 'transcribing' && (s.wsFinal || code !== 0)) return settle(s, at, effects)
  // recording / finalizing 阶段：只累积，等收尾
  return done(s, effects)
}

/**
 * 播报抑制：录音/收尾期间不出声（防回授）。
 * 由编排层在每次要开口前询问 ⇒ 这条规则也是**纯函数可断言**的。
 */
export function suppressSpeech(s) {
  return s.phase === 'recording' || s.phase === 'finalizing' || s.phase === 'transcribing' || s.phase === 'arming'
}

/** 当前应显示的主文案（一次性提示 > 叠加修饰 > 主状态） */
export function uiTextOf(s) {
  if (s.notice) return MESSAGES[s.notice] || ''
  if (s.phase === 'recording' && s.modifiers.nearLimit) return MESSAGES.nearLimit
  return MESSAGES[s.phase] || ''
}

/** 额度前置拦截的键（按 uid + 本地自然日） */
export function quotaGuardKey(uid, dayStr) {
  return `${QUOTA_GUARD_PREFIX}.${uid || 'anon'}.${dayStr}`
}
