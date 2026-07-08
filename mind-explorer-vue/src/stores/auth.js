import { defineStore } from 'pinia'
import { startGithubLogin } from '../utils/githubOAuth'
import { guestAuthApi } from '../api/guestAuth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    guest: null,
    isLoading: false
  }),

  getters: {
    isLoggedIn: (state) => !!state.user || !!state.guest,
    currentUser: (state) => state.user || state.guest,
    isGuest: (state) => !state.user && !!state.guest,
    isGuestPasswordMode: (state) => !!state.guest && state.guest.type === 'guest',
    displayName: (state) => state.user?.name || state.guest?.name || '',
  },

  actions: {
    restoreUser() {
      const match = document.cookie.match(/me_user=([^;]+)/)
      if (match) {
        try {
          this.user = JSON.parse(atob(match[1]))
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
      return this.guest
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
      window.location.href = '/'
    }
  }
})
