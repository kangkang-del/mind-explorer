// 举报 API —— 全部经 /.netlify/functions/reports 中转（service_role，前端不直连 Supabase）

const ENDPOINT = '/.netlify/functions/reports'

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

export const reportsApi = {
  // 提交举报（target_type: 'user_card' | 'community_post'）
  async submit({ targetType, targetId, reporterId, reporterType, reason, detail }) {
    const data = await post({
      action: 'submit',
      target_type: targetType,
      target_id: targetId,
      reporter_id: reporterId || null,
      reporter_type: reporterType || null,
      reason,
      detail: detail || '',
    })
    if (!data.ok) throw new Error(data.error || '举报提交失败')
    return data
  },

  // 管理员：待处理举报列表
  async list(adminPwd) {
    const data = await post({ action: 'list', adminPwd })
    return Array.isArray(data?.reports) ? data.reports : []
  },

  // 管理员：标记已处理
  async resolve(id, adminPwd) {
    const data = await post({ action: 'resolve', id, adminPwd })
    if (!data.ok) throw new Error(data.error || '操作失败')
    return data
  },
}
