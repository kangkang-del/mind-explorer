// 打卡前端封装：调用 /.netlify/functions/checkins
const ENDPOINT = '/.netlify/functions/checkins'

async function post(body) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json().catch(() => ({}))
  } catch {
    return {}
  }
}

export const checkinsApi = {
  // 记录今日打卡（source: mood | practice）
  async checkin({ userId, source }) {
    const d = await post({ action: 'checkin', userId, source })
    if (!d.ok) throw new Error(d.error || '打卡失败')
    return d
  },
  // 打卡状态：今日是否已打卡 / 连续天数 / 总天数 / 日期集合
  async status(userId) {
    if (!userId) return { checkedToday: false, streak: 0, total: 0, dates: [] }
    const d = await post({ action: 'status', userId })
    return {
      checkedToday: !!d.checkedToday,
      streak: d.streak || 0,
      total: d.total || 0,
      dates: Array.isArray(d.dates) ? d.dates : [],
    }
  },
}
