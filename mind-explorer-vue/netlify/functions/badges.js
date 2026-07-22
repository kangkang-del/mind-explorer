// Netlify Function: badges.js
// 成就徽章体系：基于已就位的服务端数据（打卡 / 收藏 / 情绪日记 / 小木对话）聚合徽章进度。
//
// 与 checkins / favorites / mood / companion 一致：全部经 service_role 中转，
// 各表 RLS 启用但不设任何 policy（仅 service_role 可访问），前端不直连。
//
// 请求体：{ action: 'list', userId }
// 返回：{ ok, badges: [{ id, name, emoji, desc, goal, metric, tier, value, earned, progress }] }
//       未配置 SUPABASE_SERVICE_ROLE_KEY 时优雅降级：返回目录 + 全 0 进度（前端仍展示「目标墙」）。

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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

// 北京时间（UTC+8）今日 YYYY-MM-DD
function todayCN() {
  const cn = new Date(Date.now() + 8 * 3600 * 1000)
  return `${cn.getUTCFullYear()}-${String(cn.getUTCMonth() + 1).padStart(2, '0')}-${String(cn.getUTCDate()).padStart(2, '0')}`
}
function prevDay(s) {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function computeStreak(set, todayStr) {
  let streak = 0
  let cur = todayStr
  while (set.has(cur)) {
    streak += 1
    cur = prevDay(cur)
  }
  return streak
}

// 徽章目录（服务端可计算的部分，单一事实来源）
const CATALOG = [
  { id: 'streak7', name: '七日坚持', emoji: '🔥', desc: '连续打卡满 7 天', goal: 7, metric: 'streak', tier: 'bronze' },
  { id: 'streak30', name: '月度坚持', emoji: '🏔️', desc: '连续打卡满 30 天', goal: 30, metric: 'streak', tier: 'silver' },
  { id: 'total100', name: '百日为伴', emoji: '📅', desc: '累计打卡满 100 天', goal: 100, metric: 'total', tier: 'gold' },
  { id: 'collector', name: '收藏家', emoji: '♥', desc: '收藏 5 个心动内容', goal: 5, metric: 'favorites', tier: 'bronze' },
  { id: 'aware', name: '觉察者', emoji: '🌤️', desc: '写下 7 篇心情日记', goal: 7, metric: 'mood', tier: 'silver' },
  { id: 'friend', name: '小木好友', emoji: '💬', desc: '与小木对话 10 次', goal: 10, metric: 'companion', tier: 'bronze' },
]

async function countRows(table, userId, extra = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&user_identifier=eq.${enc(userId)}${extra}`
  const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
  if (!res.ok) return 0
  const rows = await res.json()
  return Array.isArray(rows) ? rows.length : 0
}

async function getCheckinMetrics(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_checkins?select=checkin_date&user_identifier=eq.${enc(userId)}&order=checkin_date.desc`,
    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return { streak: 0, total: 0 }
  const rows = await res.json()
  const dates = Array.isArray(rows) ? rows.map((r) => (r.checkin_date || '').slice(0, 10)) : []
  const set = new Set(dates)
  return { streak: computeStreak(set, todayCN()), total: dates.length }
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

  if (body.action !== 'list') return json({ error: '未知 action' }, 400)

  const userId = (body.userId || '').toString().trim()
  if (!userId) return json({ ok: false, error: '缺少 userId' }, 400)

  // 优雅降级：未启用存储时返回目录 + 0 进度（前端展示目标墙，不报错）
  if (!memoryEnabled) {
    return json({
      ok: true,
      degraded: true,
      badges: CATALOG.map((c) => ({ ...c, value: 0, earned: false, progress: 0 })),
    })
  }

  try {
    const [ci, favorites, mood, companion] = await Promise.all([
      getCheckinMetrics(userId),
      countRows('user_favorites', userId),
      countRows('mood_diary', userId),
      countRows('companion_messages', userId, '&role=eq.user'),
    ])
    const metrics = { streak: ci.streak, total: ci.total, favorites, mood, companion }
    const badges = CATALOG.map((c) => {
      const value = metrics[c.metric] || 0
      return { ...c, value, earned: value >= c.goal, progress: Math.min(value / c.goal, 1) }
    })
    return json({ ok: true, badges })
  } catch (e) {
    return json({ ok: false, error: e.message }, 500)
  }
}
