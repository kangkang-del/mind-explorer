// 视口高度与键盘状态（全站共享一份）
//
// 为什么不用 100vh：手机浏览器的 100vh 是「地址栏收起时」的高度，键盘弹出时也不变，
// 所以聊天页用 100vh 计算高度时，键盘一弹输入框就被挤出可视区。
// visualViewport.height 才是真正的可见高度，键盘弹出时它会变小。
//
// keyboardOpen 的判定阈值 120px：浏览器地址栏收起/展开大约 60–100px，
// 键盘至少 200px，用 120 可以把两者分开，不会因为滚动导致底栏闪烁。

import { ref } from 'vue'

export const viewportHeight = ref(0)
export const keyboardOpen = ref(false)

let bound = false

function read() {
  if (typeof window === 'undefined') return
  const vv = window.visualViewport
  const h = Math.round(vv ? vv.height : window.innerHeight)
  viewportHeight.value = h
  keyboardOpen.value = window.innerHeight - h > 120
}

/**
 * 全局只需调用一次。重复调用是幂等的。
 */
export function bindViewport() {
  if (bound || typeof window === 'undefined') return
  bound = true
  read()
  window.addEventListener('resize', read)
  window.addEventListener('orientationchange', read)
  if (window.visualViewport) {
    // 键盘开合、地址栏收放都会触发 visualViewport 的 resize
    window.visualViewport.addEventListener('resize', read)
    window.visualViewport.addEventListener('scroll', read)
  }
}
