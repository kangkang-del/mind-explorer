// 收藏前端封装：调用 /.netlify/functions/favorites
const ENDPOINT = '/.netlify/functions/favorites'

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

export const favoritesApi = {
  // 收藏（幂等）
  async add({ userId, itemType, itemId, title, summary, link }) {
    const d = await post({ action: 'add', userId, itemType, itemId, title, summary, link })
    if (!d.ok) throw new Error(d.error || '收藏失败')
    return d
  },
  // 取消收藏
  async remove({ userId, itemType, itemId }) {
    const d = await post({ action: 'remove', userId, itemType, itemId })
    if (!d.ok) throw new Error(d.error || '取消失败')
    return d
  },
  // 我的收藏（快照列表，倒序）
  async list(userId) {
    if (!userId) return []
    const d = await post({ action: 'list', userId })
    return Array.isArray(d?.favorites) ? d.favorites : []
  },
  // 单条是否收藏
  async isFav({ userId, itemType, itemId }) {
    if (!userId) return false
    const d = await post({ action: 'isFav', userId, itemType, itemId })
    return !!d.faved
  },
}
