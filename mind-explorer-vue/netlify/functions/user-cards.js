// Netlify Function: user-cards.js
// 用户「治愈瞬间」投稿 + 审核（UGC）后端
//
// 与 companion.js / mood.js 一致：全部经 service_role 中转，前端不直连 Supabase，
// user_cards 表 RLS 启用但不设任何 policy（仅 service_role 可访问），杜绝待审内容泄漏。
//
// 前端 POST 调用，请求体统一带 action：
//   { action: 'submit',  title, content, category?, summary?, source?, author_id, author_name, author_type?, image? }
//   { action: 'approved' }                      公开列表（已通过），按时间倒序
//   { action: 'mine',     author_id }            某作者全部投稿（含待审/拒绝），用于「我的投稿」
//   { action: 'pending',  adminPwd }             待审核列表（管理）
//   { action: 'approve',  id, adminPwd }         通过
//   { action: 'reject',   id, adminPwd }         拒绝
//   { action: 'get',      id }                   单条详情（详情页）
//
// 环境变量（Netlify，不写仓库）：
//   SUPABASE_URL                 项目地址（缺省兜底）
//   SUPABASE_SERVICE_ROLE_KEY    服务端密钥（绕过 RLS 读写 user_cards）
//   ADMIN_PWD                    审核后台密码（缺省 'mind2024'）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ADMIN_PWD = process.env.ADMIN_PWD || 'mind2024'
const SB = 'user_cards'
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

function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

function isAdmin(pwd) {
  return !!pwd && pwd === ADMIN_PWD
}

// 清洗单条记录，统一前端字段
function shape(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category || '',
    summary: row.summary || '',
    source: row.source || '',
    author_id: row.author_id || '',
    author_name: row.author_name || '匿名',
    author_type: row.author_type || 'guest',
    image: row.image || '',
    status: row.status || 'pending',
    views: row.views || 0,
    likes: row.likes || 0,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at || null,
    reviewer: row.reviewer || '',
  }
}

async function listCards(filter) {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    ...filter,
  })
  const url = `${SUPABASE_URL}/rest/v1/${SB}?${params.toString()}`
  const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`读取失败 ${res.status}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows.map(shape) : []
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json({ error: '请求体无效' }, 400)
  }

  const action = body.action

  // 公开列表：已通过的治愈瞬间
  if (action === 'approved') {
    if (!memoryEnabled) return json({ cards: [] })
    try {
      const cards = await listCards({ 'status': 'eq.approved', limit: String(body.limit || 50) })
      return json({ cards })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // 单条详情
  if (action === 'get') {
    if (!memoryEnabled) return json({ card: null })
    try {
      const url = `${SUPABASE_URL}/rest/v1/${SB}?select=*&id=eq.${encodeURIComponent(body.id)}&limit=1`
      const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
      if (!res.ok) return json({ card: null })
      const rows = await res.json()
      return json({ card: shape(Array.isArray(rows) ? rows[0] : null) })
    } catch {
      return json({ card: null })
    }
  }

  // 我的投稿（按作者，含待审/拒绝）
  if (action === 'mine') {
    if (!memoryEnabled) return json({ cards: [] })
    if (!body.author_id) return json({ cards: [] })
    try {
      const cards = await listCards({ 'author_id': `eq.${body.author_id}` })
      return json({ cards })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // —— 以下为管理操作，需 ADMIN_PWD ——
  if (action === 'pending' || action === 'approve' || action === 'reject') {
    if (!isAdmin(body.adminPwd)) return json({ error: '无管理员权限' }, 403)
    if (!memoryEnabled) return json({ error: '未启用存储' }, 200)

    try {
      if (action === 'pending' || action === 'list') {
        const status = action === 'pending' ? 'pending' : (body.status || 'pending')
        const cards = await listCards({ 'status': `eq.${status}` })
        return json({ cards })
      }
      if (action === 'approve' || action === 'reject') {
        if (!body.id) return json({ error: '缺少 id' }, 400)
        const newStatus = action === 'approve' ? 'approved' : 'rejected'
        const url = `${SUPABASE_URL}/rest/v1/${SB}?id=eq.${encodeURIComponent(body.id)}`
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { ...sbHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({ status: newStatus, reviewed_at: new Date().toISOString(), reviewer: 'admin' }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return json({ error: `操作失败 ${res.status}` }, 500)
        return json({ ok: true })
      }
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  // 提交新治愈瞬间
  if (action === 'submit') {
    if (!memoryEnabled) return json({ ok: false, error: '未启用存储' }, 200)
    const title = (body.title || '').toString().trim()
    const content = (body.content || '').toString().trim()
    if (!title || !content) return json({ error: '标题和内容不能为空' }, 400)
    if (title.length > 60) return json({ error: '标题请控制在 60 字以内' }, 400)
    if (content.length > 2000) return json({ error: '内容请控制在 2000 字以内' }, 400)

    const row = {
      title,
      content,
      category: (body.category || '').toString().trim() || null,
      summary: (body.summary || '').toString().trim() || null,
      source: (body.source || '').toString().trim() || null,
      author_id: (body.author_id || '').toString().trim() || null,
      author_name: (body.author_name || '').toString().trim() || '匿名',
      author_type: (body.author_type || 'guest').toString().trim(),
      image: (body.image || '').toString().trim() || null,
      status: 'pending',
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB}`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return json({ ok: false, error: `提交失败 ${res.status}: ${txt.slice(0, 200)}` }, 500)
      }
      const rows = await res.json()
      const created = Array.isArray(rows) ? rows[0] : null
      return json({ ok: true, id: created?.id || null })
    } catch (e) {
      return json({ ok: false, error: e.message }, 500)
    }
  }

  return json({ error: '未知 action' }, 400)
}
