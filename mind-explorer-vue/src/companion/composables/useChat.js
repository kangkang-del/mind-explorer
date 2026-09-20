/**
 * useXiaomuChat —— 小木真实聊天（M1 任务 6，批次 C）
 *
 * 薄封装主站 src/api/companion.js 的 companionApi.streamChat()：
 *   SSE 真流式（meta → delta×N → done），服务不可用时自动回退一次性 JSON + 本地打字机。
 *   两条路径都逐字回调 onDelta，本层与气泡打字机天然兼容。
 *
 * 本文件只做四件事：
 *   1. 用户标识沿用主站 Companion.vue 同款逻辑：guest→g:{id}，github→gh:{username}，未登录 ''
 *   2. 维护会话内上下文 history（协议约定：不含当前消息，后端自己拼；结束后补齐本轮对话）
 *   3. 危机信号透传 crisisStore.open()（与主站同一套危机干预弹层）
 *   4. 完整回复文本在内部累积，onDone(full) 传出（companionApi 的 onDone 无参）
 */
import { computed, ref } from 'vue'
import { companionApi } from '../../api/companion'
import { useAuthStore } from '../../stores/auth'
import { useCrisisStore } from '../../stores/crisisStore'

/** 桌宠轻量上下文：最近 8 条（主站面板用 12 条，气泡场景更短更聚焦） */
const MAX_HISTORY = 8

export function useXiaomuChat() {
  const auth = useAuthStore()
  const crisisStore = useCrisisStore()

  const sending = ref(false)
  let controller = null
  let history = [] // [{ role: 'user' | 'assistant', content }]

  const userId = computed(() => {
    const u = auth.currentUser
    if (!u) return ''
    return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
  })
  const nickname = computed(() => auth.displayName || '')

  /**
   * 发送一句话（同一时刻只允许一条在途）。
   * @param {string} text 用户输入
   * @param {object} cb   { onMeta, onDelta, onDone, onError }
   *   onMeta(meta)        情绪/危机帧（crisis 已在本层透传 crisisStore.open()）
   *   onDelta(chunk)      流式增量（第一个增量 = 开始说话）
   *   onDone(full)        正常结束，full 为完整回复（可能为空串）
   *   onError(msg, kind)  kind: 'network' 服务不可用（断网/404 等）| 'server' 其他错误
   * @returns {AbortController|null} 可中断；注意流被 abort 且无内容时 companionApi
   *   静默返回（不触发 onError/onDone），调用方需自行复位 loading 状态
   */
  function send(text, { onMeta, onDelta, onDone, onError } = {}) {
    if (sending.value) return null
    sending.value = true
    let acc = ''

    controller = companionApi.streamChat({
      message: text,
      history: history.slice(-MAX_HISTORY),
      userId: userId.value,
      nickname: nickname.value,
      onMeta: (meta) => {
        if (meta && meta.crisis) crisisStore.open()
        if (onMeta) onMeta(meta)
      },
      onDelta: (chunk) => {
        acc += chunk
        if (onDelta) onDelta(chunk)
      },
      onDone: () => {
        sending.value = false
        // 本轮完整对话进上下文（协议不含当前消息，此处补齐，保持 user/assistant 交替）
        history = [
          ...history,
          { role: 'user', content: text },
          { role: 'assistant', content: acc },
        ].slice(-MAX_HISTORY)
        if (onDone) onDone(acc)
      },
      onError: (msg) => {
        sending.value = false
        const kind = isUnavailable(msg) ? 'network' : 'server'
        if (onError) onError(msg, kind)
      },
    })
    return controller
  }

  /** 中断在途请求（组件卸载/收起时调用） */
  function abort() {
    if (controller) controller.abort()
    sending.value = false
  }

  return { sending, send, abort }
}

/** 与 Companion.vue 同款判断：服务不可用类错误（断网 / 404 / 函数未部署） */
function isUnavailable(msg) {
  return !msg || /Failed to fetch|404|NetworkError|HTTP 4|load failed/i.test(msg)
}
