// 心情日记前端封装：调用 /.netlify/functions/mood
const ENDPOINT = '/.netlify/functions/mood'

export const moodApi = {
  // 记录一条心情（emotion 为情绪 key，note 可选）
  async add(userId, emotion, note) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', userId, emotion, note }),
      })
      return await res.json().catch(() => ({ ok: false }))
    } catch {
      return { ok: false }
    }
  },

  // 拉取最近 days 天的心情，用于曲线（未登录或函数未启用时返回空）
  async list(userId, days = 30) {
    if (!userId) return []
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', userId, days }),
      })
      if (!res.ok) return []
      const d = await res.json()
      return Array.isArray(d?.entries) ? d.entries : []
    } catch {
      return []
    }
  },
}
