import { defineStore } from 'pinia'

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
      window.location.href = '/.netlify/functions/auth-login'
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
