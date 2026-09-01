// 同行者「小木」对话前端封装
// 后端已自 Netlify Functions 迁移至 Supabase Edge Functions（Deno）：
//   - 免费版 wall clock 150s（原 Netlify Free 10s 硬超时导致小木频繁"走神"）
//   - 函数与数据库同机房（新加坡），记忆读写 ~5ms
// 返回一次性 JSON（reply/crisis/emotion），前端本地逐字打字机保持体验：
//   onMeta({ crisis, emotion })   情绪/危机标志
//   onDelta(content)             打字机内容增量
//   onDone()                     结束
//   onError(msg)                 错误
// 返回 AbortController，调用方可在用户停止时 abort。

const ENDPOINT = 'https://acadcmanqsldwrmysqcb.supabase.co/functions/v1/companion'

// Supabase Edge Functions 开启了 verify_jwt：请求必须带 apikey 头（网关校验用）。
// anon key 是公开的浏览器端密钥，不是私密凭证；写库权限在函数内部走 service role。
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYWRjbWFucXNsZHdybXlzcWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNjY4NTQsImV4cCI6MjEwMzY0Mjg1NH0.bd9HRJpYX0hD0sStRCTLeEvPYeq0PcV8S27tr2-JxLA'
const baseHeaders = () => ({
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
})

export const companionApi = {
  // 拉取服务端最近对话（跨设备恢复）；无 userId 或函数未启用记忆时返回空
  async getHistory(userId) {
    if (!userId) return []
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ action: 'history', userId }),
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.messages) ? data.messages : []
    } catch {
      return []
    }
  },

  // 清空服务端记忆（用户点击「清空」时调用）
  async clearHistory(userId) {
    if (!userId) return
    try {
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ action: 'clear', userId }),
      })
    } catch {
      /* 忽略 */
    }
  },

  // 每日主动陪伴语（P5-2）：拉取当天基于心情/画像生成的问候
  async getGreeting(userId) {
    if (!userId) return { ok: false }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ action: 'greeting', userId }),
      })
      return await res.json().catch(() => ({ ok: false }))
    } catch {
      return { ok: false }
    }
  },

  // 情绪复盘（陪伴深度）：基于近 7 天心情生成一段回顾
  async getRecap(userId) {
    if (!userId) return { ok: false, reason: '未登录' }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ action: 'recap', userId }),
      })
      return await res.json().catch(() => ({ ok: false }))
    } catch {
      return { ok: false }
    }
  },

  // CBT 思维记录（陪伴深度）：提交思录字段，获取认知重构引导
  async submitCbt(payload = {}) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ action: 'cbt', ...payload }),
      })
      return await res.json().catch(() => ({ ok: false }))
    } catch {
      return { ok: false }
    }
  },

  // 对话；服务端为一次性 JSON 返回（Netlify v1 兼容），前端本地逐字打字机保持体验
  // userId / nickname 启用服务端记忆与画像
  streamChat({ message, history = [], userId, nickname, onMeta, onDelta, onDone, onError, signal }) {
    const controller = new AbortController()
    const abort = signal || controller.signal

    ;(async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: baseHeaders(),
          body: JSON.stringify({ message, history, userId, nickname }),
          signal: abort,
        })
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          throw new Error(txt || `HTTP ${res.status}`)
        }
        const data = await res.json().catch(() => ({}))
        if (data.error) throw new Error(data.error)

        onMeta?.({ crisis: !!data.crisis, emotion: data.emotion || null })

        const reply = data.reply || data.content || ''
        for (const ch of reply) {
          if (abort.aborted) break
          onDelta?.(ch)
          await new Promise((r) => setTimeout(r, 30))
        }
        onDone?.()
      } catch (e) {
        if (e.name === 'AbortError') return
        onError?.(e.message || '连接失败')
      }
    })()

    return controller
  },
}
