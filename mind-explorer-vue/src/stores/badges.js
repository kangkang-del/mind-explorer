import { defineStore } from 'pinia'
import { badgesApi } from '../api/badges'

// 已见徽章集合（localStorage）：用于「新解锁」去重，避免重复弹庆祝
const SEEN_KEY = 'seen_badges_v1'
// 客户端可计算的徽章数据源（服务端不可见，仅存在于浏览器）
const CBT_KEY = 'cbt_records_v1'
const BEDTIME_KEY = 'bedtime_done_v1'

// 客户端徽章目录：数据在 localStorage，无法由服务端统计
const CLIENT_CATALOG = [
  { id: 'thinker', name: '思辨者', emoji: '🧠', desc: '完成首次 CBT 思维记录', goal: 1, tier: 'silver', storage: CBT_KEY, kind: 'array' },
  { id: 'sleeper', name: '安眠伙伴', emoji: '🌙', desc: '完成一次睡前仪式', goal: 1, tier: 'bronze', storage: BEDTIME_KEY, kind: 'flag' },
]

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}
function saveSeen(set) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...set]))
}
function clientValue(item) {
  try {
    if (item.kind === 'flag') return localStorage.getItem(item.storage) ? 1 : 0
    const raw = JSON.parse(localStorage.getItem(item.storage) || '[]')
    return Array.isArray(raw) ? raw.length : 0
  } catch {
    return 0
  }
}

export const useBadgeStore = defineStore('badges', {
  state: () => ({
    badges: [], // 合并后的全部徽章 {id,name,emoji,desc,goal,tier,value,earned,progress,source}
    newlyEarned: [], // 本次新解锁的徽章（驱动庆祝弹窗）
    loaded: false,
  }),

  getters: {
    earned: (s) => s.badges.filter((b) => b.earned),
    earnedCount: (s) => s.badges.filter((b) => b.earned).length,
    totalCount: (s) => s.badges.length,
  },

  actions: {
    // 客户端可计算的徽章（CBT / 睡前）
    clientBadges() {
      return CLIENT_CATALOG.map((c) => {
        const value = clientValue(c)
        return {
          ...c,
          source: 'client',
          value,
          earned: value >= c.goal,
          progress: Math.min(value / c.goal, 1),
        }
      })
    },

    // 拉取并合并徽章，检测新解锁
    // uid 为空时仅计算客户端徽章（游客未登录场景）
    async refresh(uid) {
      const clientB = this.clientBadges()
      let serverB = []
      if (uid) {
        const d = await badgesApi.list(uid)
        if (d.ok && Array.isArray(d.badges)) {
          serverB = d.badges.map((b) => ({ ...b, source: 'server' }))
        }
      }
      const all = [...serverB, ...clientB]

      const seen = loadSeen()
      const firstRun = !localStorage.getItem(SEEN_KEY)
      const earnedNow = all.filter((b) => b.earned).map((b) => b.id)

      let newly = []
      if (firstRun) {
        // 首次进入：静默标记为已见，不弹庆祝（避免一次性刷出历史成就）
        saveSeen(new Set(earnedNow))
      } else {
        newly = earnedNow.filter((id) => !seen.has(id))
        if (newly.length) saveSeen(new Set([...seen, ...earnedNow]))
      }

      this.badges = all
      this.newlyEarned = all.filter((b) => newly.includes(b.id))
      this.loaded = true
    },

    // 关闭庆祝弹窗
    dismissNew() {
      this.newlyEarned = []
    },
  },
})
