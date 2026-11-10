/**
 * useScenePref —— 「小木可以自己画东西」开关（M7 #114）
 *
 * 为什么单独抽出来：
 *   这个布尔量有 **四个** 消费者 —— 模型面板（改它）、对话页（决定 allowScene 与渲染）、
 *   桌宠（决定要不要剥代码）、以及历史恢复。如果每处各读一次 localStorage，
 *   就会出现「面板里关了、对话页还开着」这种只能靠刷新才好的一致性 bug。
 *   模块级 ref ⇒ 一次读盘，全应用共享，改一处立刻全局生效。
 *
 * 存储：`localStorage['xm.scene.enabled']`，'1' / '0'。
 *   ⚠️ 缺省视为 **开**（用户要求默认开）。判定必须是「键不存在 ⇒ true」，
 *      不能写成 `=== 'true'` —— 那会让没碰过开关的老用户默认变关。
 *
 * 不加后端存储：一个体验偏好，换设备丢失可接受（用户已确认）。
 */

import { ref, watch } from 'vue'

const KEY = 'xm.scene.enabled'

function readStored() {
  try {
    const v = localStorage.getItem(KEY)
    if (v === null) return true      // 缺省开
    return v === '1'
  } catch {
    return true                      // 隐私模式下 localStorage 会抛，按默认开
  }
}

const sceneEnabled = ref(readStored())

watch(sceneEnabled, (v) => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* 存不了就算了，本次会话内仍然生效 */
  }
})

export function useScenePref() {
  return {
    sceneEnabled,
    setSceneEnabled(v) {
      sceneEnabled.value = !!v
    },
  }
}
