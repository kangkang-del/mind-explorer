import { defineStore } from 'pinia'
import { startGithubLogin } from '../utils/githubOAuth'
import { guestAuthApi } from '../api/guestAuth'
import { identifierOf } from '../lib/identity'
import {
  xmAuth,
  rememberQuickGuestUid,
  pendingQuickGuestUid,
  clearPendingQuickGuestUid,
  migrateIdentity,
} from '../api/xiaomuAuth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    guest: null,
    isLoading: false,
    // 全局登录/注册弹窗（AppNavbar 挂载 LoginModal，任意页面可唤起）
    showLoginModal: false,
    loginMode: 'login',  // 'login' | 'register'
    // 批次 M4：身份升级（本机游客 → 正式账号）的状态与最近一次结果
    upgrading: false,
    lastUpgrade: null,
  }),

  getters: {
    isLoggedIn: (state) => !!state.user || !!state.guest,
    currentUser: (state) => state.user || state.guest,
    isGuest: (state) => !state.user && !!state.guest,
    isGuestPasswordMode: (state) => !!state.guest && state.guest.type === 'guest',
    displayName: (state) => state.user?.name || state.guest?.name || '',
    /** 当前身份的 user_identifier（规则唯一真源在 src/lib/identity.js） */
    identifier: (state) => identifierOf(state.user || state.guest),
  },

  actions: {
    restoreUser() {
      const match = document.cookie.match(/me_user=([^;]+)/)
      if (match) {
        try {
          this.user = JSON.parse(atob(match[1]))
          this.resumeIdentity()
          return
        } catch (e) {
          this.user = null
        }
      }
      const guestStr = localStorage.getItem('guest_info')
      if (guestStr) {
        try {
          this.guest = JSON.parse(guestStr)
        } catch (e) {
          this.guest = null
        }
      }
      if (this.guest) this.resumeIdentity()
    },

    /**
     * 身份落定后的统一收尾（批次 M）。
     * 只做一件事：如果本机还留着一个「没搬走的」快速游客身份，而当前已经是正式账号
     * （GitHub 或带密码的游客），就把那份服务端记忆接过来 —— 即「游客升级不丢记忆」。
     * 幂等、静默、可失败：拿不到凭证就什么都不做，绝不影响登录本身。
     */
    resumeIdentity() {
      this.maybeUpgrade().catch(() => { /* 升级是增强，失败不打扰用户 */ })
    },

    async maybeUpgrade() {
      if (this.upgrading) return
      const to = identifierOf(this.user || this.guest)
      const from = pendingQuickGuestUid()
      if (!to || !from || to === from) return
      // 当前身份本身还是本机游客（g:g_xxx）→ 没什么可升的，等真登录了再说
      if (/^g:g_/.test(to)) return

      this.upgrading = true
      try {
        const t = await this.sessionToken(to)
        if (!t) return   // 拿不到凭证 → 不迁移（宁可记忆留在旧身份里，也不要越权搬）
        const res = await migrateIdentity(from, to, t)
        if (res?.ok) {
          clearPendingQuickGuestUid()
          this.lastUpgrade = {
            from,
            to,
            migrated: res.migrated || {},
            at: Date.now(),
          }
        }
      } finally {
        this.upgrading = false
      }
    },

    /** 取一个能用来证明目标身份的令牌：GitHub 可现签；正式游客的令牌在登录时就地签发 */
    async sessionToken(uid) {
      const cached = xmAuth.get(uid)
      if (cached) return cached
      if (/^gh:/.test(uid)) {
        const ghToken = xmAuth.githubTokenFromCookie()
        if (ghToken) {
          const t = await xmAuth.signForGithub(uid, ghToken)
          if (t) return t
        }
      }
      return xmAuth.stale(uid)
    },

    // 游客注册（昵称 + 密码）
    async guestRegister(username, password, displayName) {
      const user = await guestAuthApi.register(username, password, displayName)
      this.guest = {
        id: user.id,
        name: user.display_name || user.username,
        username: user.username,
        avatar: user.avatar || null,
        type: 'guest'
      }
      localStorage.setItem('guest_info', JSON.stringify(this.guest))
      this.resumeIdentity()   // M4：把本机游客的记忆接过来
      return this.guest
    },

    // 游客登录（昵称 + 密码校验）
    async guestLogin(username, password) {
      const user = await guestAuthApi.login(username, password)
      this.guest = {
        id: user.id,
        name: user.display_name || user.username,
        username: user.username,
        avatar: user.avatar || null,
        type: 'guest'
      }
      localStorage.setItem('guest_info', JSON.stringify(this.guest))
      this.resumeIdentity()   // M4：同上
      return this.guest
    },

    // 游客快速进入（无需密码，本地生成会话，用于评论/点赞等轻互动）
    createGuest(name) {
      const id = 'g_' + Math.random().toString(36).slice(2, 10)
      this.guest = {
        id,
        name: name,
        username: name,
        avatar: null,
        type: 'guest'
      }
      localStorage.setItem('guest_info', JSON.stringify(this.guest))
      // M4：记下这个本机身份 —— GitHub 登录会整页跳转，不先存下来就再也找不回它
      rememberQuickGuestUid(`g:${id}`)
      return this.guest
    },

    // 全局打开登录/注册弹窗（mode: 'login' | 'register'）
    openLogin(mode = 'login') {
      this.loginMode = mode
      this.showLoginModal = true
    },

    closeLogin() {
      this.showLoginModal = false
    },

    login() {
      const isNetlify = typeof NETLIFY !== 'undefined' || window.location.hostname.includes('netlify')
      if (isNetlify) {
        window.location.href = '/.netlify/functions/auth-login'
      } else {
        startGithubLogin().catch(err => {
          alert('GitHub 登录失败: ' + err.message + '\n\n请确保已配置 GITHUB_CLIENT_ID')
        })
      }
    },

    logout() {
      document.cookie = 'me_user=; Path=/; Max-Age=0'
      localStorage.removeItem('guest_info')
      this.user = null
      this.guest = null
      // 批次 M：令牌与「待迁移的本机游客」都跟着身份走，退出即清
      // （避免同一台设备换人登录时，把上一位游客的记忆并进新账号）
      xmAuth.clear()
      clearPendingQuickGuestUid()
      this.lastUpgrade = null
      window.location.href = '/'
    }
  }
})
