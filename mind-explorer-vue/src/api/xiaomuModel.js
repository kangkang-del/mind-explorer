// 小木自定义模型的云端读写（M5-3）
//
// 走 Supabase Edge Function content 的 model.* 六个 action；身份与令牌沿用批次 M
// （authToken 由 useIdentity/xmAuth 维护，过期但签名有效也照发，服务端能确权）。
//
// 约定：**任何异常都不抛**，一律返回 { ok:false, reason, error }。
// 自定义模型是增强功能，不能在断网 / 未登录 / 后端未部署时把面板搞崩。
//
// 与服务端的契约（详细实现见 supabase/functions/content/index.js）：
//   成功：HTTP 200 + { ok:true, ... }
//   拒绝：HTTP 4xx/5xx + { error, reason? } ← ⚠️ 注意**不带 ok 字段**
//   探活失败是**刻意走 HTTP 200 + { ok:false }**（调用成功但上游不可用，不是接口错误）
import { FUNCTIONS_BASE, edgeHeaders } from '../config.js'

const ENDPOINT = `${FUNCTIONS_BASE}/content`

/**
 * 服务端 reason 码 → 用户可读文案。
 * 收在一处，面板不必在每个调用点重写一遍「该说什么」。
 * 未收录的码走 fallback（服务端 error 字段本身已是中文人话）。
 */
const REASON_TEXT = {
  // 鉴权
  token_invalid: '登录状态已失效，请重新登录',
  token_uid_mismatch: '登录状态与账号不匹配，请重新登录',
  // D6 / D11 门槛
  identity_unknown: '请先登录后再配置自己的模型',
  quick_not_allowed: '注册账号后即可配置自己的模型',
  not_in_allowlist: '自定义模型暂未对你开放',
  feature_disabled: '自定义模型功能尚未启用',
  // 参数校验
  bad_provider: '不支持的模型平台',
  model_required: '请填写模型名称',
  model_too_long: '模型名称过长',
  model_bad_char: '模型名称含非法字符',
  base_url_required: '请填写 endpoint 地址',
  key_required: '请填写你的 API Key',
  key_too_long: 'API Key 过长',
  key_unsealable: '密钥无法解封，请重新填写 API Key',
  // unsafe_endpoint 刻意不收录：服务端 error 里已带具体原因（「endpoint 不被允许：…」）
  // 状态
  no_config: '还没有配置自定义模型',
  rate_limited: '测试太频繁，请稍后再试',
  // 本地判定
  'no-identity': '请先登录',
  network: '网络不给力，请稍后再试',
}

export function modelReasonText(reason, fallback = '') {
  if (reason && REASON_TEXT[reason]) return REASON_TEXT[reason]
  return fallback || '操作失败，请稍后再试'
}

/** 统一请求。返回 { ok, status, data } 或 { ok:false, status, reason, error } */
async function call(action, payload = {}) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({ action, ...payload }),
    })
    let data = null
    try { data = await res.json() } catch { /* 空响应体 */ }
    const d = data && typeof data === 'object' ? data : {}
    if (!res.ok) {
      return { ok: false, status: res.status, reason: d.reason || `http_${res.status}`, error: d.error || '' }
    }
    return { ok: true, status: res.status, data: d }
  } catch (e) {
    return { ok: false, status: 0, reason: 'network', error: String((e && e.message) || e) }
  }
}

export const xmModel = {
  /** 预置平台清单（公开，无门槛）。返回 { ok, presets } */
  async presets() {
    const r = await call('model.presets')
    if (!r.ok) return { ok: false, reason: r.reason, error: r.error }
    return { ok: true, presets: Array.isArray(r.data.presets) ? r.data.presets : [] }
  },

  /** 读取当前配置（**绝不返回明文 Key，只有掩码**）。返回 { ok, exists, provider, baseUrl, model, keyMask, enabled, updatedAt } */
  async get(userId, authToken) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('model.get', { userId, authToken })
    if (!r.ok) return { ok: false, status: r.status, reason: r.reason, error: r.error }
    const d = r.data
    return {
      ok: true,
      exists: !!d.exists,
      provider: d.provider || '',
      baseUrl: d.baseUrl || '',
      model: d.model || '',
      keyMask: d.keyMask || '',
      enabled: d.enabled !== false,
      updatedAt: d.updatedAt || null,
      note: d.note || '',
    }
  },

  /** 保存配置。`key` 省略 = 只改模型不改 Key（服务端沿用库中密文）。
   *  返回 { ok, keyMask } */
  async save(userId, authToken, { provider, baseUrl, model, key, enabled } = {}) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('model.set', { userId, authToken, provider, baseUrl, model, key, enabled })
    if (!r.ok) return { ok: false, status: r.status, reason: r.reason, error: r.error }
    return { ok: true, keyMask: r.data.keyMask || '' }
  },

  /** 开 / 关（关闭即回落站点默认，**不删配置**）。返回 { ok, enabled } */
  async toggle(userId, authToken, enabled) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('model.toggle', { userId, authToken, enabled })
    if (!r.ok) return { ok: false, status: r.status, reason: r.reason, error: r.error }
    return { ok: true, enabled: r.data.enabled !== false }
  },

  /** 彻底恢复默认（删配置，含密文）。返回 { ok } */
  async clear(userId, authToken) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('model.clear', { userId, authToken })
    if (!r.ok) return { ok: false, status: r.status, reason: r.reason, error: r.error }
    return { ok: true }
  },

  /** 探活（服务端代发一次 1-token 请求）。每 uid 每分钟 ≤ 3 次。
   *  返回 { ok, latencyMs, model } 或 { ok:false, probe:true, latencyMs, error, detail } */
  async test(userId, authToken) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('model.test', { userId, authToken })
    if (!r.ok) return { ok: false, status: r.status, reason: r.reason, error: r.error }
    const d = r.data
    if (d.ok === false) {
      return {
        ok: false,
        probe: true,                                  // 探活失败（HTTP 200），区别于接口错误
        latencyMs: Number(d.latencyMs) || 0,
        error: d.error || '连接失败',
        detail: d.detail || '',
      }
    }
    return { ok: true, latencyMs: Number(d.latencyMs) || 0, model: d.model || '' }
  },
}
