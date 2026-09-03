// 反馈建议 API —— 经 Supabase Edge Function content 中转（feedback.*，0012 新增）
import { FUNCTIONS_BASE, edgeHeaders } from '../config.js'

const ENDPOINT = `${FUNCTIONS_BASE}/content`

async function call(action, body = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: edgeHeaders(),
    body: JSON.stringify({ action, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  // 非 2xx 一律抛错（403 用于管理员密码校验）
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`)
  return data
}

export const feedbackApi = {
  // 提交反馈（type: 'suggest' | 'issue' | 'thanks'；anonymous 匿名时不留 user 信息）
  async submit({ type, content, anonymous = false, userId, userName }) {
    const data = await call('feedback.submit', {
      type: type || 'suggest',
      content,
      anonymous: !!anonymous,
      // 注意：后端读取的是 camelCase 的 userId/userName（曾误传 user_id/user_name
      // 导致非匿名反馈的用户名永远存不进去），保持与后端一致
      userId: userId || null,
      userName: userName || null,
    })
    if (!data.ok) throw new Error(data.error || '提交失败')
    return data
  },

  // 管理员：反馈列表（status 可选：open/done；不传返回全部）
  async list(adminPwd, status) {
    const data = await call('feedback.list', { adminPwd, status: status || undefined })
    return Array.isArray(data?.feedback) ? data.feedback : []
  },

  // 管理员：标记已处理（done）
  async resolve(id, adminPwd) {
    const data = await call('feedback.resolve', { id, adminPwd })
    if (!data.ok) throw new Error(data.error || '操作失败')
    return data
  },
}
