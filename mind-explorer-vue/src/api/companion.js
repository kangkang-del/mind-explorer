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

  // 流式对话；history 为最近若干条 {role, content}（仅在未启用服务端记忆时作回退）
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
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => '')
          throw new Error(txt || `HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          let nl
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim()
            buf = buf.slice(nl + 1)
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            let evt
            try {
              evt = JSON.parse(payload)
            } catch {
              continue
            }
            if (evt.type === 'meta') onMeta?.(evt)
            else if (evt.type === 'delta') onDelta?.(evt.content || '')
            else if (evt.type === 'error') onError?.(evt.content || '未知错误')
            else if (evt.type === 'done') onDone?.()
          }
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
