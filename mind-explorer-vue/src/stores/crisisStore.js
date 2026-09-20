import { defineStore } from 'pinia'

// 危机干预弹窗的全局开关：任意输入点（小木对话 / 心情日记 / 治愈瞬间）命中高危词时调用 open()
// ⚠️ state 名不能用 open：与 action open() 同名会被 Pinia 覆盖，
//    导致 v-if="crisis.open" 读到函数恒真（弹窗每次加载必弹）→ 统一用 visible
export const useCrisisStore = defineStore('crisis', {
  state: () => ({ visible: false }),
  actions: {
    open() {
      this.visible = true
    },
    close() {
      this.visible = false
    },
  },
})
