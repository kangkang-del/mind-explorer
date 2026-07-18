// Netlify Function: mood.js
// 心情日记后端：用户每日情绪打卡，供情绪曲线与（后续）小木主动关怀使用
//
// 前端 POST 调用：
//   { action: 'add',  userId, emotion, note? }   记录一条
//   { action: 'list', userId, days? }            拉取最近 days 天（默认 30）用于曲线
//
// 隐私：mood_diary 表 RLS 仅放行 service_role；前端不直连，全部经本函数中转。
// 未配置 SUPABASE_SERVICE_ROLE_KEY 时优雅降级（add 返回未启用、list 返回空）。

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SB = 'mood_diary'
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

async function addEntry(userId, emotion, note) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ user_identifier: userId, emotion, note: note || null }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`写入 mood_diary 失败 ${res.status}`)
}

async function listEntries(userId, days) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/${SB}?select=emotion,note,created_at&user_identifier=eq.${encodeURIComponent(
    userId
  )}&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc`
  const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
  if (!res.ok) return []
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
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

  const userId = (body.userId || '').toString().trim()

  if (body.action === 'add') {
    if (!memoryEnabled) return json({ ok: false, reason: '未启用记忆存储' }, 200)
    if (!userId || !body.emotion) return json({ error: '缺少 userId 或 emotion' }, 400)
    try {
      await addEntry(userId, body.emotion, body.note)
      return json({ ok: true })
    } catch (e) {
      return json({ ok: false, error: e.message }, 500)
    }
  }

  if (body.action === 'list') {
    if (!memoryEnabled || !userId) return json({ entries: [] })
    const entries = await listEntries(userId, Number(body.days) || 30)
    return json({ entries })
  }

  return json({ error: '未知 action' }, 400)
}
