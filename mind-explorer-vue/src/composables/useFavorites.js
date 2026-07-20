// 收藏单例缓存：模块级共享 state，多个 FavoriteButton 只拉取一次「我的收藏」
import { reactive } from 'vue'
import { favoritesApi } from '../api/favorites'
import { useAuthStore } from '../stores/auth'

const state = reactive({ userId: null, loaded: false, favs: new Set() })
const keyOf = (type, id) => `${type}:${id}`

export function useFavorites() {
  const auth = useAuthStore()

  function uidOf() {
    const u = auth.currentUser
    if (!u) return ''
    return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
  }

  async function ensureLoaded() {
    const uid = uidOf()
    if (!uid) {
      state.userId = null
      state.favs.clear()
      state.loaded = true
      return
    }
    if (state.userId === uid && state.loaded) return
    state.userId = uid
    try {
      const list = await favoritesApi.list(uid)
      state.favs.clear()
      list.forEach((f) => state.favs.add(keyOf(f.type, f.id)))
      state.loaded = true
    } catch (e) {
      state.loaded = true
    }
  }

  function isFav(type, id) {
    return state.favs.has(keyOf(type, id))
  }

  async function toggle(type, id, meta = {}) {
    const uid = uidOf()
    if (!uid) return null
    const k = keyOf(type, id)
    const wasFav = state.favs.has(k)
    try {
      if (wasFav) {
        await favoritesApi.remove({ userId: uid, itemType: type, itemId: id })
        state.favs.delete(k)
      } else {
        await favoritesApi.add({ userId: uid, itemType: type, itemId: id, ...meta })
        state.favs.add(k)
      }
      return !wasFav
    } catch (e) {
      return wasFav
    }
  }

  return { state, ensureLoaded, isFav, toggle }
}
