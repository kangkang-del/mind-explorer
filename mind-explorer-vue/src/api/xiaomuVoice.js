// 小木语音输入的票据领取（M6-2c）
//
// 走 Supabase Edge Function `content` 的 `voice.iatTicket`（M6-2b 已就绪）：
// 后端签发**约 5 分钟有效**的讯飞签名 URL，前端拿它直连 `wss://iat-api.xfyun.cn/v2/iat`。
//
// 🔴 守「Key 只在后端」：响应体只有 `url` + `appId`，**apiKey / apiSecret 永不出后端**。
//    因此前端**不接触任何密钥**，也不做签名。
//
// 🔴 `url` 是等价于 Bearer 的凭据 ⇒ **不打日志、不落 localStorage、不进 URL 栏**。
//
// 约定：**任何异常都不抛**（同 `xiaomuModel.js` / `useXiaomuVoice.js` 风格）——
// 语音输入是加分项，断网 / 未登录 / 后端未部署都不能把界面搞崩。
// 一律返回 `{ ok:false, reason }`：
//   · `unsupported` ← 503 `feature_disabled`（未配 XFYUN_* 或紧急关停）
//   · `quota`       ← 429 `quota_exceeded`（站点每日额度用完 ⇒ 前端走 D16 引导）
//   · `notdeployed` ← 400「无效的操作类型」/ 404 —— 说明**后端还没上线这个 action**
//                     （曾统一误报成 network，用户看到「网络好像不太稳」，白折腾）
//   · `network`     ← 真·网络故障 / 5xx / 其它非预期状态码
import { FUNCTIONS_BASE, edgeHeaders } from '../config.js'

const ENDPOINT = `${FUNCTIONS_BASE}/content`

/**
 * 领取一次性的语音听写票据。
 * @param {string} userId 身份标识（`gh:` / `g:{uuid}` / `g:g_xxx`）
 * @param {string} authToken `useIdentity().token()` —— 无令牌也照发（服务端按旧行为放行）
 * @returns {Promise<{ok:true,url:string,appId:string,rate:number,format:string,expiresInSec:number,quota?:object}
 *                  | {ok:false,reason:'unsupported'|'quota'|'network'|'no-identity', status?:number, error?:string}>}
 */
export async function iatTicket(userId, authToken) {
  if (!userId) return { ok: false, reason: 'no-identity' }
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({ action: 'voice.iatTicket', userId, authToken }),
    })
  } catch (e) {
    return { ok: false, reason: 'network', error: String((e && e.message) || e) }
  }

  let data = null
  try { data = await res.json() } catch { /* 空响应体 / 非 JSON */ }
  const d = data && typeof data === 'object' ? data : {}

  if (!res.ok) {
    const reason = d.reason || `http_${res.status}`
    if (res.status === 503 || reason === 'feature_disabled') {
      return { ok: false, status: res.status, reason: 'unsupported', error: d.error || '' }
    }
    if (res.status === 429 || reason === 'quota_exceeded') {
      return { ok: false, status: res.status, reason: 'quota', error: d.error || '' }
    }
    // 后端根本没有这个 action（`content` 未部署到含 voice.iatTicket 的版本时，
    // 分发器会回 400「无效的操作类型：voice.iatTicket」；函数整个不存在则是 404）。
    // 这**不是**网络问题 —— 报「网络不稳」会让用户反复重试、白折腾。
    if (res.status === 404 || (res.status === 400 && /无效的操作类型/.test(String(d.error || '')))) {
      return { ok: false, status: res.status, reason: 'notdeployed', error: d.error || '' }
    }
    return { ok: false, status: res.status, reason: 'network', error: d.error || '' }
  }

  if (!d.ok || !d.url) {
    // HTTP 200 但没给可用的 url：当作上游不可用，别让前端拿着空 URL 去建 WS
    return { ok: false, status: res.status, reason: 'network', error: d.error || 'no url' }
  }

  return {
    ok: true,
    url: String(d.url),
    appId: String(d.appId || ''),
    rate: Number(d.rate) || 16000,
    format: String(d.format || ''),
    expiresInSec: Number(d.expiresInSec) || 300,
    quota: d.quota && typeof d.quota === 'object' ? d.quota : undefined,
  }
}

export const xmVoice = { iatTicket }

// ============================================================
// M6-1c：云端音色的「加密存到账号」模式（用户自带 Key）
//
// 🔴 站方零成本：这里代发的是**用户自己的** Key，本站不持有任何 TTS Key。
// ⚠️ 前端**默认不走这里**（「只存本机」直连更快、Key 也不经服务器），
//    只有用户主动选了「加密存到账号」才用 —— 好处是换设备可用，
//    以及上游不放 CORS 时唯一可行的路。
// ============================================================

/** 后端 reason → 前端统一词汇（与 cloudTts / core/iat 的 reason 对齐） */
function mapReason(status, reason) {
  const r = String(reason || '')
  if (status === 503 || r === 'feature_disabled') return 'unsupported'
  if (status === 429 || r === 'quota_exceeded' || r === 'rate_limited') return 'quota'
  if (r === 'upstream_auth') return 'bad-key'
  if (r === 'no_config' || r === 'key_required' || r === 'key_unsealable' || r === 'disabled') return 'no-config'
  if (r === 'unsafe_endpoint' || r === 'bad_ident' || r === 'bad_voice') return 'bad-config'
  if (r === 'text_too_long') return 'text-too-long'
  if (r === 'missing_params') return 'bad-request'
  if (status === 404) return 'notdeployed'
  return 'network'
}

/**
 * 统一调用。**绝不抛**，永远回 `{ ok, ... }`（同 iatTicket 风格）。
 * @returns {Promise<{ok:true,data:object}|{ok:false,reason:string,status?:number,error?:string}>}
 */
async function callContent(payload) {
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: edgeHeaders(),
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, reason: 'network', error: String((e && e.message) || e) }
  }

  let data = null
  try { data = await res.json() } catch { /* 空响应体 / 非 JSON */ }
  const d = data && typeof data === 'object' ? data : {}

  if (!res.ok) {
    // 后端根本没有这个 action（content 还没部署到含 M6-1c 的版本）
    if (res.status === 400 && /无效的操作类型/.test(String(d.error || ''))) {
      return { ok: false, status: res.status, reason: 'notdeployed', error: d.error || '' }
    }
    return {
      ok: false,
      status: res.status,
      reason: mapReason(res.status, d.reason),
      error: d.error || '',
      backendReason: d.reason || '',
    }
  }
  return { ok: true, data: d }
}

/**
 * 代发合成：把用户的文字交给**用户自己的** Key 去合成。
 * @returns {Promise<{ok:true,audioBase64:string,mime:string,chars:number}
 *                  | {ok:false,reason:string,error?:string}>}
 */
export async function ttsServer(userId, authToken, text, opts = {}) {
  if (!userId) return { ok: false, reason: 'no-identity' }
  const r = await callContent({
    action: 'audio.tts',
    userId,
    authToken,
    text: String(text == null ? '' : text),
    speed: opts.speed,
  })
  if (!r.ok) return { ok: false, reason: r.reason, error: r.error }
  const d = r.data || {}
  if (!d.ok || !d.audioBase64) {
    return { ok: false, reason: 'network', error: d.error || '没有音频' }
  }
  return {
    ok: true,
    audioBase64: String(d.audioBase64),
    mime: String(d.mime || 'audio/wav'),
    chars: Number(d.chars) || 0,
  }
}

/** 存到账号：加密落库，只回掩码 */
export async function voiceKeySet(userId, authToken, cfg) {
  if (!userId) return { ok: false, reason: 'no-identity' }
  const r = await callContent({
    action: 'voice.keySet',
    userId,
    authToken,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    voice: cfg.voice,
    key: cfg.key,
  })
  if (!r.ok) return { ok: false, reason: r.reason, error: r.error }
  return { ok: true, mask: String((r.data || {}).mask || '') }
}

/** 读账号里的配置（只回掩码，永不回密文/明文） */
export async function voiceKeyGet(userId, authToken) {
  if (!userId) return { ok: false, reason: 'no-identity' }
  const r = await callContent({ action: 'voice.keyGet', userId, authToken })
  if (!r.ok) return { ok: false, reason: r.reason, error: r.error }
  const d = r.data || {}
  return {
    ok: true,
    exists: !!d.exists,
    mask: String(d.mask || ''),
    baseUrl: String(d.baseUrl || ''),
    model: String(d.model || ''),
    voice: String(d.voice || ''),
    enabled: d.enabled !== false,
  }
}

/** 清除账号里的配置 */
export async function voiceKeyClear(userId, authToken) {
  if (!userId) return { ok: false, reason: 'no-identity' }
  const r = await callContent({ action: 'voice.keyClear', userId, authToken })
  if (!r.ok) return { ok: false, reason: r.reason, error: r.error }
  return { ok: true }
}

export const xmVoiceCloud = { ttsServer, voiceKeySet, voiceKeyGet, voiceKeyClear }
