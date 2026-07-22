// 成就徽章前端封装：调用 /.netlify/functions/badges
const ENDPOINT = '/.netlify/functions/badges'

async function post(body) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false }
    return d
  } catch {
    return { ok: false }
  }
}

export const badgesApi = {
  // 拉取该用户的徽章进度（服务端可计算部分）
  async list(userId) {
    if (!userId) return { ok: false, badges: [] }
    return post({ action: 'list', userId })
  },
}
