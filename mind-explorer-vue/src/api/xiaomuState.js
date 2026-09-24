// 小木跨设备同步的云端读写（批次 N）
//
// 走 Supabase Edge Function content 的 state.* 四个 action；身份与令牌沿用批次 M
// （authToken 由 useIdentity/xmAuth 维护，过期但签名有效也照发，服务端能确权）。
//
// 约定：**任何异常都不抛**，一律返回 { ok:false, ... }。同步是增强功能，
// 不能在断网/未登录/后端没部署时把桌宠拖崩或卡住。
import { FUNCTIONS_BASE, edgeHeaders } from '../config.js'

const ENDPOINT = `${FUNCTIONS_BASE}/content`

async function call(action, payload = {}) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({ action, ...payload }),
    })
    let data = null
    try { data = await res.json() } catch { /* 空响应体 */ }
    return { status: res.status, httpOk: res.ok, data: data && typeof data === 'object' ? data : {} }
  } catch (e) {
    return { status: 0, httpOk: false, data: {}, netError: String((e && e.message) || e) }
  }
}

export const xmState = {
  /** 读取云端状态。返回 { ok, exists, version, payload, updatedAt } */
  async get(userId, authToken) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('state.get', { userId, authToken })
    if (r.status === 403) return { ok: false, reason: 'forbidden', error: r.data.error }
    if (!r.httpOk) return { ok: false, reason: r.netError ? 'network' : `http_${r.status}`, error: r.data.error }
    return {
      ok: true,
      exists: !!r.data.exists,
      version: Number(r.data.version) || 0,
      payload: r.data.payload || null,
      updatedAt: r.data.updatedAt || null,
      note: r.data.note || '',
    }
  },

  /** 写入云端状态（乐观锁）。version=0 表示「我以为服务端还没有」。
   *  冲突返回 { ok:false, conflict:true }，由调用方重拉后再试。 */
  async put(userId, authToken, version, payload) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('state.put', { userId, authToken, version, payload })
    if (r.status === 409) return { ok: false, conflict: true, reason: 'conflict' }
    if (r.status === 413) return { ok: false, reason: 'too-large', error: r.data.error }
    if (r.status === 403) return { ok: false, reason: 'forbidden', error: r.data.error }
    if (!r.httpOk) return { ok: false, reason: r.netError ? 'network' : `http_${r.status}`, error: r.data.error }
    return { ok: true, version: Number(r.data.version) || 0 }
  },

  /** 上传自定义形象图片（dataURL 入，后端代传到私有桶）。返回 { ok, skin:{path,w,h,type,at,url} } */
  async putSkin(userId, authToken, { data, type, w, h }) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    // 1MB 上限在服务端也校验；这里提前拦一次，省一次无意义的往返
    if (typeof data !== 'string' || !data) return { ok: false, reason: 'empty' }
    const r = await call('state.putSkin', { userId, authToken, data, type, w, h })
    if (r.status === 413) return { ok: false, reason: 'too-large', error: r.data.error }
    if (r.status === 403) return { ok: false, reason: 'forbidden', error: r.data.error }
    if (r.status === 400) return { ok: false, reason: 'bad-image', error: r.data.error }
    if (!r.httpOk) return { ok: false, reason: r.netError ? 'network' : `http_${r.status}`, error: r.data.error }
    return { ok: true, skin: r.data.skin || null }
  },

  /** 删除云端形象图片（换设备后不该还能看到） */
  async clearSkin(userId, authToken) {
    if (!userId) return { ok: false, reason: 'no-identity' }
    const r = await call('state.clearSkin', { userId, authToken })
    if (!r.httpOk) return { ok: false, reason: r.netError ? 'network' : `http_${r.status}` }
    return { ok: true, removed: Number(r.data.removed) || 0 }
  },
}
