// Netlify Function: favorites.js
// 用户收藏（治愈瞬间 / 社区帖 / 知识卡片 / 小木语录）
//
// 与 companion / mood / user_cards 一致：全部经 service_role 中转，前端不直连 Supabase，
// user_favorites 表 RLS 启用但不设任何 policy（仅 service_role 可访问）。
//
// 请求体统一带 action：
//   { action: 'add',    userId, itemType, itemId, title?, summary?, link? }  收藏（幂等）
//   { action: 'remove', userId, itemType, itemId }                            取消收藏
//   { action: 'list',   userId }                                              我的收藏（快照，倒序）
//   { action: 'isFav',  userId, itemType, itemId }                           单条是否收藏
//
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（与 companion 一致）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SB = 'user_favorites'
const memoryEnabled = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body, status = 200) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const sbHeaders = () => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
})
const enc = (s) => encodeURIComponent(s)

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json({ error: '请求体无效' }, 400)
  }

  const userId = (body.userId || '').toString().trim()
  if (!memoryEnabled) return json({ ok: false, reason: '未启用收藏存储' }, 200)
  if (!userId) return json({ error: '缺少 userId' }, 400)

  const action = body.action

  // 收藏（幂等：已存在则忽略）
  if (action === 'add') {
    const { itemType, itemId, title, summary, link } = body
    if (!itemType || !itemId) return json({ error: '缺少 itemType 或 itemId' }, 400)
    try {
      const chk = await fetch(
        `${SUPABASE_URL}/rest/v1/${SB}?select=id&user_identifier=eq.${enc(userId)}&item_type=eq.${enc(itemType)}&item_id=eq.${enc(itemId)}&limit=1`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      const existing = await chk.json()
      if (Array.isArray(existing) && existing.length) return json({ ok: true, existed: true })

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB}`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_identifier: userId,
          item_type: itemType,
          item_id: String(itemId),
          title: (title || '').toString().trim() || null,
          summary: (summary || '').toString().trim() || null,
          link: (link || '').toString().trim() || null,
        }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return json({ ok: false, error: `收藏失败 ${res.status}: ${txt.slice(0, 160)}` }, 500)
      }
      return json({ ok: true })
    } catch (e) {
      return json({ ok: false, error: e.message }, 500)
    }
  }

  // 取消收藏
  if (action === 'remove') {
    const { itemType, itemId } = body
    if (!itemType || !itemId) return json({ error: '缺少 itemType 或 itemId' }, 400)
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/${SB}?user_identifier=eq.${enc(userId)}&item_type=eq.${enc(itemType)}&item_id=eq.${enc(itemId)}`,
        { method: 'DELETE', headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      return json({ ok: true })
    } catch (e) {
      return json({ ok: false, error: e.message }, 500)
    }
  }

  // 我的收藏列表（快照，倒序）
  if (action === 'list') {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${SB}?select=*&user_identifier=eq.${enc(userId)}&order=created_at.desc`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      const rows = await res.json()
      const favorites = Array.isArray(rows)
        ? rows.map((r) => ({
            type: r.item_type,
            id: r.item_id,
            title: r.title || '',
            summary: r.summary || '',
            link: r.link || '',
            created_at: r.created_at,
          }))
        : []
      return json({ favorites })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // 单条是否收藏
  if (action === 'isFav') {
    const { itemType, itemId } = body
    if (!itemType || !itemId) return json({ faved: false })
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${SB}?select=id&user_identifier=eq.${enc(userId)}&item_type=eq.${enc(itemType)}&item_id=eq.${enc(itemId)}&limit=1`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      const rows = await res.json()
      return json({ faved: Array.isArray(rows) && rows.length > 0 })
    } catch {
      return json({ faved: false })
    }
  }

  return json({ error: '未知 action' }, 400)
}
