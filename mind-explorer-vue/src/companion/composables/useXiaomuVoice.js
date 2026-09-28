/**
 * useXiaomuVoice —— 小木的「说话」能力（M6-1，浏览器原生 TTS，**零成本**）
 *
 * 为什么先用浏览器原生：
 *   `speechSynthesis` 免费、离线可用、无需 Key、无需后端 —— 与 §12.3「播报可做到零成本」一致。
 *   智谱云端音色（需后端 `audio.tts` + 真计费）留作 **M6-1b**，单独报批。
 *
 * 设计约束：
 *   1. **任何异常都不抛**（同 `api/xiaomuModel.js` 风格）—— 播报是锦上添花，出错必须静默。
 *   2. **单例**（模块级共享）：桌宠与对话页必须共用同一条播报队列，否则两边各说各的、互相打断。
 *   3. `speechSynthesis` 不可用 → `supported=false`，UI 按 D9 隐藏入口。
 *   4. 自动播放策略：`speak()` 只在有用户手势上下文的路径被调用（点开关 / 刚发过消息），
 *      不在纯定时器里发起 —— iOS/Safari 才不会拦。
 *
 * 为什么内部按句切块（而不是把整段丢进一个 utterance）：
 *   · Chrome/Edge 桌面版对**单个超长 utterance**有「约 15 秒被静默截断」的老毛病；
 *   · 切成句子后顺序播，停顿天然、也更像人在说话（回应 D7）。
 *   这不改变 D7「v1 整段」的语义 —— 不调云端分句接口，只在本地排队。
 *
 * 音色挑选（D13「系统音色」，自动排序）：
 *   中文（zh）优先 → 其中本地音色优先 → 再按 zh-CN → 最后兜底第一个。
 */
import { ref } from 'vue'

const hasSS =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof window.SpeechSynthesisUtterance === 'function'

/** 语音可用性：静态判定，不需要响应式（同一浏览器内不会变） */
export const voiceSupported = hasSS

/** 语速夹取（与 useXiaomuPrefs.normRate 一致） */
export function clampRate(v) {
  if (!Number.isFinite(v)) return 1
  return Math.min(1.6, Math.max(0.6, v))
}

/** 单块最大字符数（超出则硬切，防长句依旧被截断） */
const CHUNK_MAX = 90
/** 句子最短聚合长度：太短的句子会被并进上一块，避免「嗯。」单独播一句显得突兀 */
const CHUNK_MIN = 26

/**
 * 把一段文字切成按句的播报块。
 * 在句末标点处断句；连续短句会聚合；超长无标点的串按 CHUNK_MAX 硬切。
 * 返回 [] 表示无可播内容。
 */
export function chunkForSpeech(text) {
  const s = String(text == null ? '' : text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return []
  const out = []
  let buf = ''
  for (const ch of s) {
    buf += ch
    const isEnd = '。！？!?；;'.includes(ch)
    if ((isEnd && buf.length >= CHUNK_MIN) || buf.length >= CHUNK_MAX) {
      out.push(buf.trim())
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out.filter(Boolean)
}

let shared = null

export function useXiaomuVoice() {
  if (shared) return shared

  /** [{ uri, name, lang, local }] —— 供 UI 下拉 */
  const voices = ref([])
  /** 是否正在出声 */
  const speaking = ref(false)
  /** 至少拿到过一次音色列表（部分浏览器首帧为空） */
  const voicesReady = ref(false)
  /** 音色列表拿不到时的说明（仅用于面板提示） */
  const note = ref('')

  let rawVoices = []        // 原始 SpeechSynthesisVoice 对象
  let queue = []            // 待播块
  let queueIdx = 0
  let activeUtterance = null
  let seqToken = 0          // 每次 speak/stop 自增；旧回调据此失效
  let hooked = false
  let pollTimer = null

  const ZH_RE = /^zh(\b|[-_])/i

  /** 从浏览器拉一次音色列表 */
  function refresh() {
    if (!hasSS) return
    try {
      const list = window.speechSynthesis.getVoices() || []
      rawVoices = list
      voices.value = list.map((v) => ({
        uri: v.voiceURI,
        name: v.name,
        lang: v.lang || '',
        local: !!v.localService,
      }))
      if (list.length) {
        voicesReady.value = true
        note.value = ''
      }
    } catch {
      /* 静默：拿不到列表不致命，播放时用浏览器默认音色 */
    }
  }

  /**
   * 加载音色列表。多数浏览器首帧为空，需要等 `voiceschanged`；
   * 个别浏览器只在首次 speak 前才填充 → 加一个有限次轮询兜底（最多 10 次 × 250ms）。
   */
  function loadVoices() {
    if (!hasSS) return
    refresh()
    if (voicesReady.value) return
    if (!hooked) {
      hooked = true
      try { window.speechSynthesis.addEventListener('voiceschanged', refresh) } catch { /* 老浏览器：忽略 */ }
    }
    let n = 0
    clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      refresh()
      if (voicesReady.value || ++n >= 10) {
        clearInterval(pollTimer)
        pollTimer = null
        if (!voicesReady.value) note.value = '这个浏览器没有提供可选的音色，会用系统默认的来念。'
      }
    }, 250)
  }

  /**
   * 挑一个音色：优先用户选的；否则自动排序（中文 → 本地 → zh-CN → 兜底第一个）。
   * @param {string} preferredURI
   * @returns {SpeechSynthesisVoice|null}
   */
  function pickVoice(preferredURI) {
    if (!rawVoices.length) return null
    if (preferredURI) {
      const hit = rawVoices.find((v) => v.voiceURI === preferredURI)
      if (hit) return hit
    }
    const zh = rawVoices.filter((v) => ZH_RE.test(v.lang || ''))
    const pool = zh.length ? zh : rawVoices
    return (
      pool.find((v) => v.localService && /zh[-_]?CN/i.test(v.lang || '')) ||
      pool.find((v) => /zh[-_]?CN/i.test(v.lang || '')) ||
      pool.find((v) => v.localService) ||
      pool[0] ||
      null
    )
  }

  /** 内部：播下一块（onend 接力） */
  function speakNext(token, opts) {
    if (token !== seqToken) return
    const piece = queue[queueIdx++]
    if (!piece) {
      activeUtterance = null
      speaking.value = false
      if (opts.onEnd) opts.onEnd('end')
      return
    }
    let u
    try {
      u = new window.SpeechSynthesisUtterance(piece)
    } catch {
      // 连 utterance 都建不出来 → 直接结束，避免死循环
      activeUtterance = null
      speaking.value = false
      if (opts.onEnd) opts.onEnd('error')
      return
    }
    const v = pickVoice(opts.voiceURI)
    if (v) {
      u.voice = v
      u.lang = v.lang || 'zh-CN'
    }
    u.rate = clampRate(opts.rate)
    u.pitch = 1
    u.onend = () => { if (token === seqToken) speakNext(token, opts) }
    u.onerror = (e) => {
      if (token !== seqToken) return
      // interrupted / canceled 是主动打断的正常结果，不算失败
      const kind = (e && e.error) || ''
      if (kind === 'interrupted' || kind === 'canceled') return
      activeUtterance = null
      speaking.value = false
      if (opts.onEnd) opts.onEnd('error')
    }
    activeUtterance = u
    try {
      window.speechSynthesis.speak(u)
    } catch {
      activeUtterance = null
      speaking.value = false
      if (opts.onEnd) opts.onEnd('error')
    }
  }

  /**
   * 播报一段文字（会打断上一条）。
   * @param {string} text
   * @param {{ voiceURI?:string, rate?:number, onStart?:Function, onEnd?:Function }} [opts]
   * @returns {boolean} 是否真的开始播（false = 不支持/空文本/异常）
   */
  function speak(text, opts = {}) {
    if (!hasSS) { if (opts.onEnd) opts.onEnd('unsupported'); return false }
    const pieces = chunkForSpeech(text)
    if (!pieces.length) { if (opts.onEnd) opts.onEnd('empty'); return false }
    stop()
    const token = ++seqToken
    queue = pieces
    queueIdx = 0
    // 立即置为「出声中」，UI 不必等 onstart（onstart 在移动端有肉眼可见的延迟）
    speaking.value = true
    if (opts.onStart) opts.onStart()
    speakNext(token, opts)
    return true
  }

  /** 打断当前播报（幂等；随时可调） */
  function stop() {
    seqToken++
    queue = []
    queueIdx = 0
    activeUtterance = null
    if (hasSS) {
      try { window.speechSynthesis.cancel() } catch { /* 静默 */ }
    }
    speaking.value = false
  }

  /** 试听（面板用）：念一句固定的话 */
  function preview(voiceURI, rate) {
    return speak('嗯，我是小木。这样就可以听见我说话啦。', { voiceURI, rate })
  }

  /** 当前默认会用的音色名（面板显示用）；不需要精确，够用即可 */
  function currentVoiceName(preferredURI) {
    const v = pickVoice(preferredURI)
    return v ? v.name : ''
  }

  if (hasSS) loadVoices()

  shared = {
    supported: hasSS,
    voices,
    voicesReady,
    speaking,
    note,
    loadVoices,
    pickVoice,
    currentVoiceName,
    speak,
    stop,
    preview,
  }
  return shared
}
