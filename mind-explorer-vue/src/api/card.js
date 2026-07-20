// 卡片点赞/评论 API —— 全部经 Netlify Function (card-engagement) 中转。
// 不再前端直连 Supabase：消除硬编码 publishable key 与 RLS 直连风险，
// 与 favorites / checkins / user-cards 的统一隐私模型一致。
//
// 接口对齐旧 card.js，CardDetail.vue 调用点无需改动：
//   getLikes(cardId)    -> [{user_identifier, user_type}]
//   toggleLike(cardId,user) -> { liked }
//   getComments(cardId) -> [...]
//   addComment(cardId,content,user) -> row|null

const FN = '/.netlify/functions/card-engagement'

async function post(action, payload = {}) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  if (!res.ok) throw new Error(`请求失败 ${res.status}`)
  return res.json()
}

export const cardApi = {
  // 获取点赞列表
  async getLikes(cardId) {
    const data = await post('getLikes', { cardId })
    return data.likes || []
  },

  // 切换点赞状态（幂等），返回 { liked }
  async toggleLike(cardId, user) {
    const data = await post('toggleLike', { cardId, user })
    return { liked: !!data.liked }
  },

  // 获取评论列表
  async getComments(cardId) {
    const data = await post('getComments', { cardId })
    return data.comments || []
  },

  // 新增评论，返回插入的行
  async addComment(cardId, content, user) {
    const data = await post('addComment', { cardId, content, user })
    return data.comment || null
  },
}
