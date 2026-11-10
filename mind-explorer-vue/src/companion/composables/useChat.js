/**
 * useXiaomuChat —— 小木真实聊天（M1 任务 6，批次 C）
 *
 * 薄封装主站 src/api/companion.js 的 companionApi.streamChat()：
 *   SSE 真流式（meta → delta×N → done），服务不可用时自动回退一次性 JSON + 本地打字机。
 *   两条路径都逐字回调 onDelta，本层与气泡打字机天然兼容。
 *
 * 本文件只做四件事：
 *   1. 用户标识来自 useIdentity（规则真源 src/lib/identity.js；批次 M1 收敛前此处曾各写一份）
 *   2. 维护会话内上下文 history（协议约定：不含当前消息，后端自己拼；结束后补齐本轮对话）
 *   3. 危机信号透传 crisisStore.open()（与主站同一套危机干预弹层）
 *   4. 完整回复文本在内部累积，onDone(full) 传出（companionApi 的 onDone 无参）
 */
import { ref } from 'vue'
import { companionApi } from '../../api/companion'
import { useCrisisStore } from '../../stores/crisisStore'
import { useIdentity } from '../../composables/useIdentity'
import { useScenePref } from '../../composables/useScenePref'
// M7：桌宠不显示画面卡片，但**必须**把代码从文字里切掉。
// 切在这一层而不是在 XiaomuPet 里，是因为下面的 acc 会回写进下一次请求的上下文 ——
// 不切的话她下一轮会读到自己的代码，token 会失控地涨。
import { createSceneStream } from '../core/sceneStream'

/** 桌宠轻量上下文：最近 8 条（主站面板用 12 条，气泡场景更短更聚焦） */
const MAX_HISTORY = 8

export function useXiaomuChat() {
  const ident = useIdentity()
  const crisisStore = useCrisisStore()
  const { sceneEnabled } = useScenePref()

  const sending = ref(false)
  let controller = null
  let history = [] // [{ role: 'user' | 'assistant', content }]

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
    // M7：代码不进 acc（acc 既是气泡文字、也是下一轮的上下文）
    const sceneSt = createSceneStream()

    controller = companionApi.streamChat({
      message: text,
      history: history.slice(-MAX_HISTORY),
      userId: ident.userId.value,
      nickname: ident.nickname.value,
      authToken: ident.token(),   // M2：会话令牌（无则服务端过渡期按旧行为放行）
      allowScene: sceneEnabled.value === true,
      onMeta: (meta) => {
        if (meta && meta.crisis) crisisStore.open()
        if (onMeta) onMeta(meta)
      },
      onDelta: (chunk) => {
        const t = sceneSt.push(chunk).text
        // reducer 吐「全量正文」，气泡打字机只吃「增量」。
        // 正常情况 t 一定以 acc 开头；极少数情况会变短（游离标签 <br> 被剔掉），
        // 那时不发增量、只把 acc 校正回来 —— 桌宠是次要界面，宁可少几个字也不要错位。
        const delta = t.startsWith(acc) ? t.slice(acc.length) : ''
        acc = t
        if (onDelta && delta) onDelta(delta)
      },
      onDone: () => {
        sending.value = false
        // 🔴 finish() 之前 acc 可能少一截被按住的尾巴
        acc = sceneSt.finish().text
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
