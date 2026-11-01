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
 *
 * ===== M6-1b：云端音色（用户自带 Key，站方零成本）=====
 * 产品原则：本站只提供免费的语音；付费的一律用户自带 Key（R1–R3）。
 * 所以这里**没有额度、没有计费、没有站点 Key** —— 只用用户自己在设置里填的那把。
 *
 * 两条路只替换「怎么拿到音频」：
 *   system → speechSynthesis（本文件既有逻辑，**一行未改**）
 *   cloud  → utils/cloudTts.synthesize()（拿到 Blob）→ <audio> 接力
 * 切块 / 预取 / 接力 / stop 释放**只有一份编排**，避免两套逻辑各修各的 bug。
 *
 * 云端特有的三条规则：
 *   ① **预取**：播第 i 块时就发第 i+1 块的请求 —— 否则块间会有肉眼可见的空档；
 *   ② **回落**：云端失败时用系统音色把**剩余文本**接着念完（首块失败＝整段）；
 *   ③ **例外**：`bad-key` **不回落** —— Key 错了就直说，静默回落会让用户以为 Key 生效了。
 */
import { ref } from 'vue'
import { useXiaomuPrefs } from './useXiaomuPrefs'
import { synthesize, synthesizeViaServer, getKey, ZHIPU_VOICES } from '../../utils/cloudTts'
import { useIdentity } from '../../composables/useIdentity'

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

/**
 * 云端音色的切块粒度。
 *
 * 比系统音色（26–90 字）**更细**，原因是云端每块都要一次网络往返：
 *   · 块太大 → 首音要等整块合成完（40 字 ≈ 8 秒音频，合成约 1–2 秒）
 *   · 块太小 → 请求数暴涨，块间空档反而更明显
 * 40 字是「首音延迟」与「请求数」的折中；实测后可调。
 * 也顺带远低于上游 1024 字硬限，留足余量。
 */
const CLOUD_CHUNK_MAX = 40
const CLOUD_CHUNK_MIN = 12

/**
 * 云端播报的切块：在句末/逗号处断，短句聚合，无标点长串按 max 硬切。
 * 与 `chunkForSpeech` 分开写而**不去改它** —— 后者是 M6-1 已验收的路径，动它有回归风险。
 */
export function chunkForCloud(text, max = CLOUD_CHUNK_MAX) {
  const s = String(text == null ? '' : text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return []
  const out = []
  let buf = ''
  for (const ch of s) {
    buf += ch
    const isEnd = '。！？!?；;，,'.includes(ch)
    if ((isEnd && buf.length >= CLOUD_CHUNK_MIN) || buf.length >= max) {
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
  /** 云端音色的最近一次失败说明（面板显示，成功后清空） */
  const cloudNotice = ref('')

  let rawVoices = []        // 原始 SpeechSynthesisVoice 对象
  let queue = []            // 待播块
  let queueIdx = 0
  let activeUtterance = null
  let seqToken = 0          // 每次 speak/stop 自增；旧回调据此失效
  let hooked = false
  let pollTimer = null

  // ---- 云端播报的运行时状态（与系统音色的状态刻意分开，互不干扰）----
  let audioEl = null         // 当前播放的 <audio>
  let cloudAbort = null      // 当前在途合成的 AbortController
  const cloudUrls = new Set()  // 所有已创建、待回收的 blob URL
  let cloudResolve = null    // 让 cloudPlay 的 Promise 在 stop() 时也能结束（否则 await 会挂住）

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
   * M6-1b 起按 `prefs.voiceEngine` 分流：system（默认，免费）/ cloud（用户自带 Key）。
   * @param {string} text
   * @param {{ voiceURI?:string, rate?:number, onStart?:Function, onEnd?:Function }} [opts]
   * @returns {boolean} 是否真的开始播（false = 不支持/空文本/异常）
   */
  function speak(text, opts = {}) {
    const prefs = useXiaomuPrefs()
    if (prefs.voiceEngine === 'cloud') return speakCloud(text, opts)
    return speakSystem(text, opts)
  }

  /** 系统音色路径 —— 即 M6-1 的原实现，**一行未改**（已验收，不动它） */
  function speakSystem(text, opts = {}) {
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

  /** 云端音色路径的入口：切块 → 起一个 run，立刻返回（不阻塞 UI） */
  function speakCloud(text, opts = {}) {
    const pieces = chunkForCloud(text)
    if (!pieces.length) { if (opts.onEnd) opts.onEnd('empty'); return false }
    // 注意：这里不 require hasSS —— 云端播报靠 <audio>，与 speechSynthesis 无关。
    // （但面板的入口仍以 hasSS 判定，属已知小瑕疵，见 M6-1b 清单「已知局限」。）
    stop()
    const token = ++seqToken
    speaking.value = true
    if (opts.onStart) opts.onStart()
    cloudRun(token, pieces, opts)
    return true
  }

  /**
   * 云端播报主循环：串行合成 + **预取下一块** + 逐块接力播放。
   *
   * 为什么要预取：播第 i 块大约 8 秒，而合成第 i+1 块要 1–2 秒。
   * 若等播完再请求，每块之间会有 1–2 秒静默（听感上像卡住了）；提前发就能把空档压到不可感知。
   * 任何时刻**最多一个在途请求**，所以 `cloudAbort` 只存一个就够了。
   */
  async function cloudRun(token, pieces, opts) {
    const prefs = useXiaomuPrefs()
    // 两种传输：local（Key 在本机，浏览器直连）/ account（Key 在服务端加密存，后端代发）
    const useServer = prefs.ttsTransport === 'account'
    let fetchOne = null

    if (useServer) {
      // 账号模式的 Key 存在服务端，本机不需要有 —— 但必须已登录才有 uid
      const ident = useIdentity()
      if (!ident.userId.value) {
        onCloudFail(token, pieces, 0, { reason: 'no-identity', message: '请先登录后再用云端音色' }, opts)
        return
      }
      const uid = ident.userId.value
      const authToken = ident.token()
      const speed = prefs.voiceRate
      // ⚠️ 账号模式没有前端 AbortController（api 层不接 signal）：stop() 后**在途请求会自然跑完**，
      //    结果被 token 检查丢弃。多花的那一次合成用的是用户自己的额度，已记为已知代价。
      fetchOne = (t) => synthesizeViaServer({ userId: uid, authToken, text: t, speed })
    } else {
      const key = getKey()
      if (!key) {
        onCloudFail(token, pieces, 0, { reason: 'bad-key', message: '还没有填密钥' }, opts)
        return
      }
      const common = {
        baseUrl: prefs.ttsBaseUrl,
        model: prefs.ttsModel,
        voice: prefs.ttsVoice,
        speed: prefs.voiceRate,
        key,
      }
      fetchOne = (t) => {
        const ctrl = new AbortController()
        cloudAbort = ctrl
        return synthesize({ ...common, text: t, signal: ctrl.signal })
      }
    }

    let nextP = fetchOne(pieces[0])
    for (let i = 0; i < pieces.length; i++) {
      const r = await nextP
      // 被打断（用户点了停止 / 又发了新一条）→ 静默退出，一个状态都别碰
      if (token !== seqToken) return
      if (!r.ok) { onCloudFail(token, pieces, i, r, opts); return }
      // 先把下一块发出去，再播这一块 —— 顺序不能反，否则预取就白做了
      if (i + 1 < pieces.length) nextP = fetchOne(pieces[i + 1])
      await cloudPlay(r.blob, token)
      if (token !== seqToken) return
    }
    finishCloud(opts)
  }

  /**
   * 播放一个 Blob，正常播完 / 出错 / 被 stop() 打断**都会 resolve** ——
   * 这是关键：stop() 里 `audio.pause()` 不会触发 onended，若不额外放行，await 会永远挂住。
   */
  function cloudPlay(blob, token) {
    return new Promise((resolve) => {
      if (token !== seqToken) { resolve(); return }
      let url = ''
      try { url = URL.createObjectURL(blob) } catch { resolve(); return }
      cloudUrls.add(url)
      const a = new Audio(url)
      audioEl = a
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        cloudResolve = null
        if (audioEl === a) audioEl = null
        cloudUrls.delete(url)
        try { URL.revokeObjectURL(url) } catch { /* 静默 */ }
        resolve()
      }
      cloudResolve = done
      a.onended = done
      // 解码失败 / 格式不被支持 → 结束，别把队列卡死
      a.onerror = done
      try {
        const p = a.play()
        // 自动播放被浏览器拦（无用户手势）→ 直接收尾，不重试、不报错弹窗
        if (p && typeof p.catch === 'function') p.catch(done)
      } catch {
        done()
      }
    })
  }

  /** 云端失败：要么直说（bad-key），要么把**剩余文本**交给系统音色念完 */
  function onCloudFail(token, pieces, idx, r, opts) {
    if (token !== seqToken) return
    if (r.reason === 'aborted') return          // 用户主动停的，什么都不做
    cloudNotice.value = r.message || '云端音色出错了'
    stopCloud()
    speaking.value = false

    // 🔴 bad-key 不回落：Key 错了必须让用户看见，静默回落会让他以为 Key 生效了
    if (r.reason === 'bad-key') {
      if (opts.onEnd) opts.onEnd('bad-key')
      return
    }
    // 其余失败 → 用系统音色把剩下的念完（首块失败就等于整段）。播报是加分项，不能哑掉。
    if (!hasSS) { if (opts.onEnd) opts.onEnd('error'); return }
    const rest = pieces.slice(idx).join('')
    speakSystem(rest, opts)
  }

  function finishCloud(opts) {
    stopCloud()
    speaking.value = false
    if (opts.onEnd) opts.onEnd('end')
  }

  /** 释放云端资源（幂等）。注意：**不动 seqToken**，token 的失效只由 stop()/speak() 管 */
  function stopCloud() {
    if (cloudAbort) {
      try { cloudAbort.abort() } catch { /* 静默 */ }
      cloudAbort = null
    }
    if (audioEl) {
      const a = audioEl
      audioEl = null
      try { a.pause() } catch { /* 静默 */ }
      try { a.removeAttribute('src') } catch { /* 静默 */ }
      try { a.load() } catch { /* 静默 */ }   // 让浏览器真正释放已缓冲的音频
    }
    for (const u of cloudUrls) {
      try { URL.revokeObjectURL(u) } catch { /* 静默 */ }
    }
    cloudUrls.clear()
    const r = cloudResolve
    cloudResolve = null
    if (r) r()   // 放行挂起的 cloudPlay，避免 await 永远不返回
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
    stopCloud()
    speaking.value = false
  }

  /** 试听（面板用）：念一句固定的话，按当前引擎分流 */
  function preview(voiceURI, rate) {
    const prefs = useXiaomuPrefs()
    if (prefs.voiceEngine === 'cloud') {
      return speakCloud('嗯，我是小木。这样就可以听见我说话啦。', {})
    }
    return speakSystem('嗯，我是小木。这样就可以听见我说话啦。', { voiceURI, rate })
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
    cloudNotice,
    loadVoices,
    pickVoice,
    currentVoiceName,
    speak,
    stop,
    preview,
    ZHIPU_VOICES,
  }
  return shared
}
