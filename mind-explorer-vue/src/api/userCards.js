// 用户「治愈瞬间」投稿 API —— 全部经 /.netlify/functions/user-cards 中转
// （service_role 读写，前端不直连 Supabase，user_cards 表 RLS 仅放行 service_role）

const ENDPOINT = '/.netlify/functions/user-cards'

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

export const userCardsApi = {
  // 提交一条治愈瞬间（author_* 来自登录态）
  async submit(card) {
    const data = await post({
      action: 'submit',
      title: card.title,
      content: card.content,
      category: card.category || '',
      summary: card.summary || '',
      source: card.source || '',
      author_id: card.author_id,
      author_name: card.author_name,
      author_type: card.author_type || 'guest',
      image: card.image || '',
    })
    if (!data.ok) throw new Error(data.error || '提交失败')
    return data
  },

  // 公开列表：已通过的治愈瞬间
  async getApproved(limit = 50) {
    const data = await post({ action: 'approved', limit })
    return Array.isArray(data?.cards) ? data.cards : []
  },

  // 我的投稿（含待审 / 通过 / 拒绝）
  async getMine(authorId) {
    if (!authorId) return []
    const data = await post({ action: 'mine', author_id: authorId })
    return Array.isArray(data?.cards) ? data.cards : []
  },

  // 管理员：待审核列表
  async getPending(adminPwd) {
    const data = await post({ action: 'pending', adminPwd })
    return Array.isArray(data?.cards) ? data.cards : []
  },

  // 管理员：已拒绝列表
  async getRejected(adminPwd) {
    const data = await post({ action: 'list', status: 'rejected', adminPwd })
    return Array.isArray(data?.cards) ? data.cards : []
  },

  // 管理员：通过
  async approve(id, adminPwd) {
    const data = await post({ action: 'approve', id, adminPwd })
    if (!data.ok) throw new Error(data.error || '操作失败')
    return data
  },

  // 管理员：拒绝
  async reject(id, adminPwd) {
    const data = await post({ action: 'reject', id, adminPwd })
    if (!data.ok) throw new Error(data.error || '操作失败')
    return data
  },

  // 单条详情
  async getById(id) {
    const data = await post({ action: 'get', id })
    return data?.card || null
  },

  // 管理员：设为/取消精选
  async setFeatured(id, on, adminPwd) {
    const data = await post({ action: on ? 'feature' : 'unfeature', id, adminPwd })
    if (!data.ok) throw new Error(data.error || '操作失败')
    return data
  },

  // 批量抱抱数：传入 card id 数组，返回 { [id]: count }
  async hugBatch(ids) {
    const data = await post({ action: 'hugBatch', ids: ids || [] })
    return data?.map || {}
  },

  // 当前用户在给定卡片里的已抱抱集合：返回 [card_id,...]
  async myHugs(ids, userIdentifier) {
    const data = await post({ action: 'hugMine', ids: ids || [], user_identifier: userIdentifier })
    return data?.liked || []
  },

  // 切换抱抱状态，返回 { hugged, count }
  async toggleHug(cardId, uid, type) {
    const data = await post({ action: 'hugToggle', cardId, user_identifier: uid, user_type: type })
    if (!data || typeof data.count === 'undefined') throw new Error(data?.error || '操作失败')
    return data
  },
}
