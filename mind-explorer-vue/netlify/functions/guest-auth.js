// Netlify Function: 游客账号（用户名 + 密码）认证后端中转
//
// 收口说明：原前端 src/api/guestAuth.js 直连 Supabase（暴露 publishable key，
// 且 guest_users 表的「任何人可读」策略可能泄露 password_hash）。现全部经本函数
// service_role 中转，与 community / user-cards 同模式：
//   - 前端不直连 Supabase，不再暴露 publishable key
//   - RLS 由 service_role 绕过，前端拿不到 password_hash
//
// 安全模型（与历史一致，不回归）：密码在前端做 SHA-256 哈希后发送，本函数
// 仅存储/比对哈希值，不接触明文。
//
// 前端 POST 调用，请求体统一带 action：
//   { action: 'register', username, passwordHash, displayName }
//   { action: 'login',    username, passwordHash }
//   { action: 'getInfo',  userId }
//   { action: 'check',    username }
//
// 环境变量（Netlify，不写仓库）：
//   SUPABASE_URL                 项目地址（缺省兜底）
//   SUPABASE_SERVICE_ROLE_KEY    服务端密钥（绕过 RLS 读写 guest_users）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const memoryEnabled = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)
const TABLE = 'guest_users'

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

// 公开字段（绝不返回 password_hash）
const PUBLIC_COLS = 'id,username,display_name,avatar,bio,is_banned,created_at,last_login_at'

function shape(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    avatar: row.avatar || null,
    bio: row.bio || '',
    is_banned: !!row.is_banned,
    created_at: row.created_at || null,
    last_login_at: row.last_login_at || null,
  }
}

async function register(body) {
  const username = (body.username || '').toString().trim()
  const passwordHash = (body.passwordHash || '').toString().trim()
  const displayName = (body.displayName || '').toString().trim() || username
  if (!username) throw new Error('昵称不能为空')
  if (!passwordHash) throw new Error('密码不能为空')

  const row = {
    username,
    password_hash: passwordHash,
    display_name: displayName,
    created_at: new Date().toISOString(),
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // 唯一约束冲突：23505
    if (res.status === 409 || err?.code === '23505') {
      throw new Error('该昵称已被使用，请换一个')
    }
    const txt = await res.text().catch(() => '')
    throw new Error(`注册失败 ${res.status}: ${(err?.message || txt).slice(0, 200)}`)
  }
  const rows = await res.json()
  return shape(Array.isArray(rows) ? rows[0] : null)
}

async function login(body) {
  const username = (body.username || '').toString().trim()
  const passwordHash = (body.passwordHash || '').toString().trim()
  if (!username || !passwordHash) throw new Error('用户名或密码错误')

  const params = new URLSearchParams({
    select: PUBLIC_COLS,
    username: `eq.${username}`,
    password_hash: `eq.${passwordHash}`,
    is_banned: 'eq.false',
    limit: '1',
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`登录失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  const rows = await res.json()
  const user = Array.isArray(rows) && rows[0] ? rows[0] : null
  if (!user) throw new Error('用户名或密码错误')

  // 更新最后登录时间（best-effort）
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    // 忽略更新失败，不影响登录
  }
  return shape(user)
}

async function getInfo(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=${PUBLIC_COLS}&id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) throw new Error(`读取失败 ${res.status}`)
  const rows = await res.json()
  return shape(Array.isArray(rows) ? rows[0] : null)
}

async function checkUsername(username) {
  const u = (username || '').toString().trim()
  if (!u) return { available: false }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=username&username=eq.${encodeURIComponent(u)}&limit=1`,
    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) throw new Error(`校验失败 ${res.status}`)
  const rows = await res.json()
  return { available: !(Array.isArray(rows) && rows.length > 0) }
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
      case 'register':
        return json({ user: await register(body) })
      case 'login':
        return json({ user: await login(body) })
      case 'getInfo':
        return json({ user: await getInfo(body.userId) })
      case 'check':
        return json(await checkUsername(body.username))
      default:
        return json({ error: '无效的操作类型：' + action }, 400)
    }
  } catch (e) {
    return json({ error: e.message || '操作失败' }, 500)
  }
}
