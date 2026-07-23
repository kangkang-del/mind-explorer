// Netlify Function: 举报（覆盖治愈瞬间 user_card 与 社区帖 community_post）
//
// 与 user-cards / community 同模式：全部经 service_role 中转，前端不直连 Supabase。
// reports 表 RLS 启用但不设 policy，仅 service_role 可访问。
//
// 前端 POST 调用，请求体统一带 action：
//   { action: 'submit', target_type, target_id, reporter_id?, reporter_type?, reason, detail? }
//   { action: 'list',   adminPwd }             待处理举报（status=open），按时间倒序
//   { action: 'resolve',adminPwd, id }         标记已处理
//
// 环境变量（Netlify，不写仓库）：
//   SUPABASE_URL                 项目地址（缺省兜底）
//   SUPABASE_SERVICE_ROLE_KEY    服务端密钥（绕过 RLS 读写 reports）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ADMIN_PWD = process.env.ADMIN_PWD || 'mind2024'
const TABLE = 'reports'
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

async function submit(body) {
  const target_type = (body.target_type || '').toString().trim()
  const target_id = (body.target_id || '').toString().trim()
  const reason = (body.reason || '').toString().trim()
  if (!['user_card', 'community_post'].includes(target_type)) throw new Error('无效的目标类型')
  if (!target_id) throw new Error('缺少目标标识')
  if (!reason) throw new Error('请选择举报理由')

  const row = {
    target_type,
    target_id,
    reporter_id: (body.reporter_id || '').toString().trim() || null,
    reporter_type: (body.reporter_type || '').toString().trim() || null,
    reason,
    detail: (body.detail || '').toString().trim() || null,
    status: 'open',
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`举报提交失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  return { ok: true }
}

async function listOpen() {
  const params = new URLSearchParams({
    select: '*',
    status: 'eq.open',
    order: 'created_at.desc',
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`读取举报失败 ${res.status}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

async function resolve(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'resolved', resolved_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`处理失败 ${res.status}`)
  return { ok: true }
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

  if (!memoryEnabled) return json({ error: '未启用存储' }, 200)

  const action = body.action
  try {
    switch (action) {
      case 'submit':
        return json(await submit(body))
      case 'list':
        if (!isAdmin(body.adminPwd)) return json({ error: '无管理员权限' }, 403)
        return json({ reports: await listOpen() })
      case 'resolve':
        if (!isAdmin(body.adminPwd)) return json({ error: '无管理员权限' }, 403)
        return json(await resolve(body.id))
      default:
        return json({ error: '无效的操作类型：' + action }, 400)
    }
  } catch (e) {
    return json({ error: e.message || '操作失败' }, 500)
  }
}
