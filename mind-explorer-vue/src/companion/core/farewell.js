/**
 * farewell —— 「小木化身告别」的单向信号（批次 P）
 *
 * ── 为什么单独抽一个模块 ────────────────────────────────────────
 * 删除成功后有两件事要发生：
 *   ① 页面渲染告别语（AccountPurge 自己就能做）
 *   ② **桌宠也要说这句话** —— 而桌宠是挂在整个 App 上的全局组件（XiaomuPet.vue），
 *      它在 /profile 页删除时并不知道「刚刚发生了告别」
 *
 * 抽成模块级单例的响应式标志，是**最小侵入**的做法：
 *   · 不动三轨状态机（idle / talk / sleep 那套逻辑一行没改）
 *   · 不新增防打扰规则（不参与主动搭话的节流判断）
 *   · 只是一次「强制进入告别态」的许可，用完即弃，页面刷新后自然归零
 *
 * 刻意**不持久化**（不写 localStorage）：告别是一次性的仪式，
 * 刷新页面后小木如果还在说「朋友再见」会很诡异。
 *
 * ⚠️ 单向不可逆：置真后只有 `reset()` 能清（由离开告别页时调用），
 *    防止某条路径把标志误清掉导致告别语中途消失。
 */
import { ref } from 'vue'

const active = ref(false)

/** 触发告别（删除成功后调用，幂等） */
export function announceFarewell() {
  active.value = true
}

/** 是否处于告别态（桌宠读这个） */
export function isFarewell() {
  return active.value
}

/** 复位（离开告别礼后调用；页面刷新天然复位） */
export function resetFarewell() {
  active.value = false
}

/** 给组件用的响应式引用（只读，不要直接改它 —— 走上面三个函数） */
export const farewellActive = active

/** 桌宠告别时说的那句话 —— 与 AccountPurge 的 FAREWELL 逐字一致 */
export const FAREWELL_LINE = '朋友，再见，祝你天天开心。'
