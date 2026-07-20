// Netlify Function: card-engagement.js
// 知识卡片「点赞 / 评论」经 Supabase service_role 中转。
//
// 与 favorites / checkins / user-cards 一致：前端不再直连 Supabase（消除硬编码
// publishable key 与 RLS 直连风险），guest_likes / guest_comments 表 RLS 启用但
// 不设开放 policy，仅 service_role 可访问。
//
// 前端 src/api/card.js 通过 POST { action, ... } 调用，接口对齐旧 card.js：
//   getLikes(cardId)    -> { likes: [{user_identifier,user_type}] }
//   toggleLike(cardId,user) -> { liked: bool }   (幂等切换)
//   getComments(cardId) -> { comments: [...] }
//   addComment(cardId,content,user) -> { comment: row|null }
//
// 环境变量：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SB_LIKES = 'guest_likes'
const SB_COMMENTS = 'guest_comments'
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

  // 未配置 service_role：优雅降级，返回空数据（不报错）
  if (!memoryEnabled) return json({ ok: false, reason: '未启用存储', likes: [], comments: [] }, 200)

  const action = body.action
  const cardId = parseInt(body.cardId)
  if (!cardId) return json({ error: '缺少 cardId' }, 400)

  // —— 获取点赞列表 ——
  if (action === 'getLikes') {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${SB_LIKES}?select=user_identifier,user_type&card_id=eq.${cardId}`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      const rows = await res.json()
      return json({ likes: Array.isArray(rows) ? rows : [] })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // —— 切换点赞（幂等）——
  if (action === 'toggleLike') {
    const user = body.user || {}
    const identifier = user.type === 'github' ? user.username : user.id
    const userType = user.type || (user.token ? 'github' : 'guest')
    if (!identifier) return json({ error: '缺少用户标识' }, 400)
    try {
      const chk = await fetch(
        `${SUPABASE_URL}/rest/v1/${SB_LIKES}?select=id&card_id=eq.${cardId}&user_identifier=eq.${enc(identifier)}&limit=1`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      const existing = await chk.json()
      if (Array.isArray(existing) && existing.length) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/${SB_LIKES}?card_id=eq.${cardId}&user_identifier=eq.${enc(identifier)}`,
          { method: 'DELETE', headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
        )
        return json({ liked: false })
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_LIKES}`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ card_id: cardId, user_identifier: identifier, user_type: userType }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return json({ error: `点赞写入失败 ${res.status}: ${txt.slice(0, 160)}` }, 500)
      }
      return json({ liked: true })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // —— 获取评论列表（倒序）——
  if (action === 'getComments') {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${SB_COMMENTS}?select=*&card_id=eq.${cardId}&order=created_at.desc`,
        { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      const rows = await res.json()
      return json({ comments: Array.isArray(rows) ? rows : [] })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // —— 新增评论 ——
  if (action === 'addComment') {
    const user = body.user || {}
    const content = (body.content || '').toString().trim()
    if (!content) return json({ error: '评论不能为空' }, 400)
    const userType = user.type || (user.token ? 'github' : 'guest')
    const username = user.name || user.username || '匿名'
    const avatar = user.avatar || null
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_COMMENTS}`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({ card_id: cardId, content, user_type: userType, username, avatar }),
        signal: AbortSignal.timeout(8000),
      })
      const rows = await res.json()
      return json({ comment: Array.isArray(rows) && rows[0] ? rows[0] : null })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  return json({ error: '未知 action' }, 400)
}
