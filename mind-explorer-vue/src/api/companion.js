// 同行者「小木」对话前端封装
// 以流式方式消费 companion 函数返回的 SSE，逐帧回调：
//   onMeta({ crisis, emotion })   首帧：危机/情绪
//   onDelta(content)             内容增量（打字机）
//   onDone()                     结束
//   onError(msg)                 错误
// 返回 AbortController，调用方可在用户停止时 abort。

const ENDPOINT = '/.netlify/functions/companion'

export const companionApi = {
  // 拉取服务端最近对话（跨设备恢复）；无 userId 或函数未启用记忆时返回空
  async getHistory(userId) {
    if (!userId) return []
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
