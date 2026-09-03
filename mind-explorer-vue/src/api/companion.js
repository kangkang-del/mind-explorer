// 同行者「小木」对话前端封装（0012：直连 Supabase Edge Function，真流式）
//
// streamChat 消费 companion 函数的 SSE（stream:true），逐帧回调：
//   onMeta({ crisis, emotion })   首帧：危机/情绪
//   onDelta(content)             内容增量（真流式：来一段显示一段）
//   onDone()                     结束
//   onError(msg)                 错误（字符串）
// 返回 AbortController，调用方可在用户停止时 abort。
// 兼容回退：后端若返回一次性 JSON（如网关错误页 / 旧版），自动降级为本地打字机，
// 调用方无需区分两种路径。

import { FUNCTIONS_BASE, edgeHeaders } from '../config'

const ENDPOINT = `${FUNCTIONS_BASE}/companion`

export const companionApi = {
  // 拉取服务端最近对话（跨设备恢复）；无 userId 或未启用记忆时返回空
  async getHistory(userId) {
    if (!userId) return []
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: edgeHeaders(),
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
        headers: edgeHeaders(),
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
        headers: edgeHeaders(),
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
        headers: edgeHeaders(),
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
        headers: edgeHeaders(),
        body: JSON.stringify({ action: 'cbt', ...payload }),
      })
      return await res.json().catch(() => ({ ok: false }))
    } catch {
      return { ok: false }
    }
  },

  // 对话（真流式）：SSE 逐帧消费，失败自动回退一次性 JSON
  streamChat({ message, history = [], userId, nickname, onMeta, onDelta, onDone, onError, signal }) {
    const controller = new AbortController()
    const abort = signal || controller.signal

    ;(async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: edgeHeaders(),
          body: JSON.stringify({ message, history, userId, nickname, stream: true }),
          signal: abort,
        })

        const ct = res.headers.get('content-type') || ''

        // ---- 回退路径：一次性 JSON（含错误响应）→ 本地打字机保持体验 ----
        if (!res.ok || (!ct.includes('text/event-stream') && !ct.includes('stream'))) {
          const txt = await res.text().catch(() => '')
          let data = {}
          try { data = JSON.parse(txt) } catch { /* 非 JSON */ }
          if (!res.ok || data.error) {
            throw new Error(data.error || (!res.ok ? txt || `HTTP ${res.status}` : ''))
          }
          onMeta?.({ crisis: !!data.crisis, emotion: data.emotion || null })
          const reply = data.reply || data.content || ''
          for (const ch of reply) {
            if (abort.aborted) break
            onDelta?.(ch)
            await new Promise((r) => setTimeout(r, 30))
          }
          onDone?.()
          return
        }

        // ---- 主路径：SSE 逐帧解析（meta → delta×N → done）----
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let full = ''

        const handleFrame = (rawEvent) => {
          const line = rawEvent.split('\n').find((l) => l.trim().startsWith('data:'))
          if (!line) return
          let ev
          try { ev = JSON.parse(line.trim().slice(5).trim()) } catch { return }
          if (ev.type === 'meta') {
            onMeta?.({ crisis: !!ev.crisis, emotion: ev.emotion || null })
          } else if (ev.type === 'delta') {
            full += ev.content || ''
            onDelta?.(ev.content || '')
          }
          // done 帧无需单独处理：流读完统一 onDone
        }

        while (true) {
          const { value, done: readDone } = await reader.read()
          if (readDone) break
          buf += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            handleFrame(buf.slice(0, idx))
            buf = buf.slice(idx + 2)
          }
        }
        if (buf.trim()) handleFrame(buf)

        if (!full && abort.aborted) return
        onDone?.()
      } catch (e) {
        if (e.name === 'AbortError') return
        onError?.(e.message || '连接失败')
      }
    })()

    return controller
  },
}
