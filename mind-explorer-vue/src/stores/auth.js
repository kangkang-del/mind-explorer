import { defineStore } from 'pinia'
import { startGithubLogin } from '../utils/githubOAuth'

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

    createGuest(name) {
      const guest = {
        id: 'guest_' + Math.random().toString(36).substring(2, 10),
        name: name,
        avatar: null,
        type: 'guest'
      }
      localStorage.setItem('guest_info', JSON.stringify(guest))
      this.guest = guest
    },

    login() {
      // 优先尝试 Netlify Functions（后端方案）
      // 如果 Netlify 不可用（如 GitHub Pages），回退到纯前端 PKCE
      const isNetlify = typeof NETLIFY !== 'undefined' || window.location.hostname.includes('netlify')

      if (isNetlify) {
        // Netlify 部署：走后端 auth-login function
        window.location.href = '/.netlify/functions/auth-login'
      } else {
        // GitHub Pages / Vercel 等静态部署：走纯前端 PKCE
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
