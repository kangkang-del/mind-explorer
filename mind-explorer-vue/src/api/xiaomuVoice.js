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
//   · `network`     ← 网络 / 5xx / 其它非预期状态码
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
