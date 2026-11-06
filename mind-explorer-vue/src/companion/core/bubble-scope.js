/**
 * bubble-scope —— 哪些路由下「桌宠不弹气泡」（W3）
 *
 * 为什么抽成纯函数：桌宠气泡是主站共享呈现链路，改它要能**证明**而不是靠肉眼。
 * 纯函数零 DOM、零 Vue、零 router 依赖 ⇒ Node 可以直接 import 做断言，
 * 组件只负责把 `router.currentRoute.value.name` 传进来。
 *
 * 判定用**路由名**而不是路径：
 *   · 路径可能带参数/尾斜杠（`/companion/story/`），容易漏判；
 *   · 路由名是编译期常量，改了路径也不会静默失效。
 *
 * 只抑制**气泡**，不抑制：桌宠本体、拖拽、三轨状态机、主动搭话的节流判断。
 * 也就是说主动搭话仍会照常「想说话」，只是说不出来 —— 故事书页要的就是安静。
 */

/** 需要安静、不允许气泡遮挡正文的路由名 */
export const BUBBLE_SUPPRESSED_ROUTES = Object.freeze(['CompanionStory'])

/**
 * @param {string|null|undefined} routeName vue-router 的 `currentRoute.value.name`
 * @returns {boolean} true = 该路由下不弹气泡
 */
export function shouldSuppressBubble(routeName) {
  if (!routeName) return false
  return BUBBLE_SUPPRESSED_ROUTES.includes(String(routeName))
}
