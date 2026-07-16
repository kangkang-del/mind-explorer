// 同行者「小木」对话前端封装
// 以流式方式消费 companion 函数返回的 SSE，逐帧回调：
//   onMeta({ crisis, emotion })   首帧：危机/情绪
//   onDelta(content)             内容增量（打字机）
//   onDone()                     结束
//   onError(msg)                 错误
// 返回 AbortController，调用方可在用户停止时 abort。

const ENDPOINT = '/.netlify/functions/companion'

export const companionApi = {
  // 流式对话；history 为最近若干条 {role, content}
  streamChat({ message, history = [], onMeta, onDelta, onDone, onError, signal }) {
    const controller = new AbortController()
    const abort = signal || controller.signal

    ;(async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history }),
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
