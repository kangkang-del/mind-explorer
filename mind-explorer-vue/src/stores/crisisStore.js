import { defineStore } from 'pinia'

// 危机干预弹窗的全局开关：任意输入点（小木对话 / 心情日记 / 治愈瞬间）命中高危词时调用 open()
export const useCrisisStore = defineStore('crisis', {
  state: () => ({ open: false }),
  actions: {
    open() {
      this.open = true
    },
    close() {
      this.open = false
    },
  },
})
