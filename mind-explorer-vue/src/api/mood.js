// 心情日记前端封装：经 Supabase Edge Function content 中转（mood.add / mood.list）
//
// [S2 2026-11-10] 新增 authToken 参数：只**多带一个字段**，服务端当前不校验，
// 行为与之前完全一致。目的是让后端在 S3 收紧 mood.* 时有凭证可用。
// 拿不到令牌就传 ''（useIdentity().token() 的契约），服务端过渡期按无令牌放行。
import { FUNCTIONS_BASE, edgeHeaders } from '../config.js'

const ENDPOINT = `${FUNCTIONS_BASE}/content`

export const moodApi = {
  // 记录一条心情（emotion 为情绪 key，note 可选）
  async add(userId, emotion, note, authToken) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: edgeHeaders(),
        body: JSON.stringify({ action: 'mood.add', userId, emotion, note, authToken }),
      })
      return await res.json().catch(() => ({ ok: false }))
    } catch (e) {
      console.error('mood.add 请求失败（网络/跨域/后端错误）', e)
      return { ok: false }
    }
  },

  // 拉取最近 days 天的心情，用于曲线（未登录或函数未启用时返回空）
  async list(userId, days = 30, authToken) {
    if (!userId) return []
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: edgeHeaders(),
        body: JSON.stringify({ action: 'mood.list', userId, days, authToken }),
      })
      if (!res.ok) return []
      const d = await res.json()
      return Array.isArray(d?.entries) ? d.entries : []
    } catch (e) {
      console.error('mood.list 请求失败', e)
      return []
    }
  },
}
