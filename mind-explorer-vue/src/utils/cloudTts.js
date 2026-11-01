/**
 * cloudTts —— 云端音色的「取音频」传输层（M6-1b，用户自带 Key）
 *
 * 产品原则（R1–R3）：**本站不持有任何 TTS Key**。云端音色一律用用户自己的 Key，
 * 站方不产生第三方费用 ⇒ 这里没有额度、没有计费、没有站点 Key。
 * 用户不配 Key，就永远只有浏览器系统音色（免费档，零成本）。
 *
 * 本文件只做一件事：**给定参数，返回一个音频 Blob**。
 * 排队 / 播放 / 状态机全部在 useXiaomuVoice.js 里 —— 这样 system 与 cloud 两条路
 * 只替换「怎么拿到音频」这一个动作，编排逻辑只有一份（否则两边各修各的 bug）。
 *
 * 🔴 CORS 实测（2026-11-01）：智谱 `open.bigmodel.cn` 的 `/audio/speech`
 *    对**任意 Origin 回显放行**（Allow-Headers 含 authorization），故浏览器可直连、Key 不经本站服务器。
 *    ⚠️ 但**别家服务未必放行** ⇒ 「浏览器直连失败」必须能与「真的断网」区分开，
 *       否则用户会看到「网络不好」然后一直重试。判别法见 `probeReachable()`。
 *
 * 🔴 Key 存 localStorage 键 `xm_tts_key`，**不进 prefs 对象**：
 *    prefs 会被整体序列化写盘、被诊断脚本 dump。Key 不进去，就少三条泄露路径。
 *    代价（已在 UI 明示）：它是明文，XSS 可读；清缓存会丢；换设备要重填。
 *
 * 约定：**任何异常都不抛**，一律 `{ ok:false, reason }`（同 `api/xiaomuVoice.js` 风格）。
 *   reason ∈ bad-key | quota | cors | upstream | network | aborted | text-too-long | bad-request
 */

const KEY_STORE = 'xm_tts_key'

/** 智谱 7 个内置音色（来源：docs.bigmodel.cn …/glm-tts「可选音色」，2026-11-01 查阅） */
export const ZHIPU_VOICES = [
  { id: 'tongtong', label: '彤彤 · 默认' },
  { id: 'chuichui', label: '锤锤 · 活泼' },
  { id: 'xiaochen', label: '小陈 · 沉稳男声' },
  { id: 'jam', label: 'jam · 动物圈' },
  { id: 'kazi', label: 'kazi · 动物圈' },
  { id: 'douji', label: 'douji · 动物圈' },
  { id: 'luodo', label: 'luodo · 动物圈' },
]

/** 上游硬限：input ≤1024 字符（官方文档，超长是报错不是截断） */
export const TTS_INPUT_MAX = 1024

/** 本地 Key 读写 —— 全程 try/catch：隐私模式下 localStorage 会抛 */
export function getKey() {
  try { return String(localStorage.getItem(KEY_STORE) || '') } catch { return '' }
}
export function setKey(v) {
  const s = String(v || '').trim()
  try {
    if (s) localStorage.setItem(KEY_STORE, s)
    else localStorage.removeItem(KEY_STORE)
  } catch { /* 静默：存不下就只在本次会话内存里用 */ }
  return s
}
export function clearKey() {
  try { localStorage.removeItem(KEY_STORE) } catch { /* 静默 */ }
}

const clampSpeed = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  return Math.min(2, Math.max(0.5, n))
}

/**
 * 判断「主机是否可达」—— 只为把 CORS 失败从「真断网」里摘出来。
 *
 * 原理：`mode:'no-cors'` 的请求**不会因为跨域被拦而抛错**（拿回一个 opaque 响应）。
 *   ① no-cors 也抛 ⇒ 是真的连不上（断网 / DNS / 证书）
 *   ② no-cors 成功、而正式的 POST 抛 TypeError ⇒ 是 CORS / 预检被拒
 * 代价：多一个请求，但只在**已经失败之后**才发，正常路径零开销。
 */
async function probeReachable(baseUrl) {
  try {
    await fetch(`${baseUrl}/audio/speech`, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
    return true
  } catch {
    return false
  }
}

/** 上游错误体 → 友好的中文（本地模式下可以直说，因为 Key 是用户自己的） */
function upstreamMessage(status, body) {
  const raw = body && body.error ? body.error.message || body.error.code : ''
  const m = String(raw || '').slice(0, 160)
  if (status === 401 || status === 403) return '密钥无效或已过期'
  if (status === 429) return '你的密钥额度或请求频率到上限了'
  if (/1214|音色/.test(m)) return '这个音色不存在，换一个试试'
  return m || `云端返回 ${status}`
}

/**
 * 合成一段文本。
 * @param {object} o
 * @param {string} o.baseUrl 兼容端点（不含 /audio/speech），如 https://open.bigmodel.cn/api/paas/v4
 * @param {string} o.model   如 glm-tts
 * @param {string} o.voice   如 tongtong
 * @param {string} o.text
 * @param {number} [o.speed] 0.5–2
 * @param {string} o.key     用户自己的 Key
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{ok:true, blob:Blob}
 *                  | {ok:false, reason:string, status?:number, message?:string}>}
 */
export async function synthesize(o = {}) {
  const text = String(o.text == null ? '' : o.text).trim()
  const key = String(o.key || '').trim()
  const baseUrl = String(o.baseUrl || '').replace(/\/+$/, '')
  const model = String(o.model || 'glm-tts').trim()
  const voice = String(o.voice || 'tongtong').trim()

  if (!text) return { ok: false, reason: 'bad-request', message: '没有要念的内容' }
  if (text.length > TTS_INPUT_MAX) {
    return { ok: false, reason: 'text-too-long', message: `一次最多 ${TTS_INPUT_MAX} 字` }
  }
  if (!key) return { ok: false, reason: 'bad-key', message: '还没有填密钥' }
  if (!baseUrl) return { ok: false, reason: 'bad-request', message: '还没有填接口地址' }

  let res
  try {
    res = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        // 🔴 这行是唯一出现 Key 的地方。不打日志、不进 URL、不进错误信息。
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        // 用 wav：<audio> 能直接播，省掉前端解码 PCM 的一层
        response_format: 'wav',
        speed: clampSpeed(o.speed),
        // 🔴 watermark_enabled 刻意**不下发** —— 上游默认 true（显式+隐式水印，合规项），
        //    永远不给「关掉水印」这个选项。
      }),
      signal: o.signal,
    })
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, reason: 'aborted' }
    // fetch 抛 TypeError 有两种完全不同的原因：真断网 / 被 CORS 拦。必须分清。
    const reachable = await probeReachable(baseUrl)
    if (reachable) {
      return {
        ok: false,
        reason: 'cors',
        message: '这个服务不允许浏览器直连（跨域被拒）。请换智谱官方地址，或改用「加密存到账号」。',
      }
    }
    return { ok: false, reason: 'network', message: '连不上这个服务，检查一下网络或接口地址' }
  }

  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch { /* 非 JSON（可能是文本错误页） */ }
    const status = res.status
    const reason =
      status === 401 || status === 403 ? 'bad-key'
        : status === 429 ? 'quota'
          : 'upstream'
    return { ok: false, status, reason, message: upstreamMessage(status, body) }
  }

  // 有些供应商「出错也回 200」，body 是 JSON —— 不能直接把 JSON 当音频播
  const ctype = String(res.headers.get('content-type') || '').toLowerCase()
  if (ctype.includes('application/json')) {
    let body = null
    try { body = await res.json() } catch { /* 静默 */ }
    return { ok: false, status: 200, reason: 'upstream', message: upstreamMessage(200, body) }
  }

  let blob
  try {
    const buf = await res.arrayBuffer()
    if (!buf || !buf.byteLength) return { ok: false, reason: 'upstream', message: '云端返回了空音频' }
    blob = new Blob([buf], { type: ctype || 'audio/wav' })
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, reason: 'aborted' }
    return { ok: false, reason: 'network', message: '音频传输出错' }
  }

  return { ok: true, blob }
}

export const cloudTts = { synthesize, getKey, setKey, clearKey, ZHIPU_VOICES, TTS_INPUT_MAX }
