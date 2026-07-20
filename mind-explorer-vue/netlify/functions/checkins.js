// Netlify Function: checkins.js
// 每日打卡（记录心情 / 完成练习均计为当日打卡）
//
// 与 companion / mood / user_cards / favorites 一致：全部经 service_role 中转，
// user_checkins 表 RLS 启用但不设任何 policy（仅 service_role 可访问）。
//
// 请求体统一带 action：
//   { action: 'checkin', userId, source? }       记录今日打卡（幂等，每天一条）
//   { action: 'status',  userId, days? }          今日是否已打卡 + 连续天数 + 近 N 天日期集合
//
// 「今天」以北京时间（UTC+8）为基准，贴合国内用户；连续天数从今天往前数。

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SB = 'user_checkins'
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

// 北京时间（UTC+8）的今日 YYYY-MM-DD
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

async function getAllDates(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB}?select=checkin_date&user_identifier=eq.${enc(userId)}&order=checkin_date.desc`,
    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
  )
  const rows = await res.json()
  return Array.isArray(rows) ? rows.map((r) => (r.checkin_date || '').slice(0, 10)) : []
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
  if (!memoryEnabled) return json({ ok: false, reason: '未启用打卡存储' }, 200)
  if (!userId) return json({ error: '缺少 userId' }, 400)

  const today = todayCN()

  // 记录今日打卡（upsert，每天一条）
  if (body.action === 'checkin') {
    const source = (body.source || 'mood').toString().trim()
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/${SB}?on_conflict=user_identifier,checkin_date`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_identifier: userId, checkin_date: today, source }),
        signal: AbortSignal.timeout(8000),
      })
      const dates = await getAllDates(userId)
      return json({ ok: true, checkedToday: true, streak: computeStreak(new Set(dates), today) })
    } catch (e) {
      return json({ ok: false, error: e.message }, 500)
    }
  }

  // 状态：今日是否已打卡 + 连续天数 + 全部日期
  if (body.action === 'status') {
    try {
      const dates = await getAllDates(userId)
      const set = new Set(dates)
      return json({
        checkedToday: set.has(today),
        streak: computeStreak(set, today),
        total: dates.length,
        dates,
      })
    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  return json({ error: '未知 action' }, 400)
}
