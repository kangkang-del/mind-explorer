/**
 * useIdentity —— 身份的单例外壳（批次 M1）
 *
 * 规则本身在 src/lib/identity.js（纯函数，唯一真源）；本文件只做三件事：
 *   1. 把「当前身份」变成响应式（组件里能直接跟 auth store 联动）
 *   2. 单例（沿用 useXiaomuPrefs / useXiaomuSkin 的模块级共享约定）
 *   3. 把「令牌签发时机」这条策略收在一处
 *
 * 收敛前，同一套规则被抄了三份、各自演化就会不一致：
 *   views/Companion.vue:227 / companion/composables/useChat.js:30
 *   companion/components/XiaomuPet.vue:440
 * 而 user_identifier 是服务端记忆的归属键 —— 三处不一致 = 记忆串号。
 *
 * 身份种类与后端 _shared/auth.js 的白名单严格对应：
 *   none   未登录        → ''          只走本地 localStorage，不产生服务端记忆
 *   quick  快速游客      → g:g_{b36}   仅本机，换设备即丢 → 升级路径见 M4
 *   guest  正式游客      → g:{uuid}    guest_users 表里的一行，有密码，可跨设备
 *   github GitHub        → gh:{login}  cookie me_user
 */
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { identifierOf, kindOf } from '../lib/identity'
import { xmAuth, migrateIdentity, pendingQuickGuestUid, clearPendingQuickGuestUid } from '../api/xiaomuAuth'

/** 模块级单例 */
let shared = null

export function useIdentity() {
  if (shared) return shared
  const auth = useAuthStore()

  const kind = computed(() => kindOf(auth.currentUser))
  const userId = computed(() => identifierOf(auth.currentUser))
  const nickname = computed(() => auth.displayName || '')
  const isLoggedIn = computed(() => !!userId.value)
  const isQuickGuest = computed(() => kind.value === 'quick')

  /** 同步取要随请求发出的令牌：优先未过期的；已过期但签名有效的也照发
   *  （服务端验签后仍能确权，只多一条被节流的日志）。没有则返回 ''，
   *   过渡期服务端按「无令牌」旧行为放行 —— 拿不到凭证不该让人说不了话。 */
  function token() {
    const uid = userId.value
    return xmAuth.get(uid) || xmAuth.stale(uid)
  }

  /**
   * 确保有一个尽量新鲜的令牌。**永不抛错、永不阻塞对话**：拿不到就返回 ''，
   * 服务端过渡期允许无令牌访问，所以最坏情况只是退化成今天的行为。
   */
  async function ensureToken({ force = false } = {}) {
    const uid = userId.value
    if (!uid) return ''
    if (!force && !xmAuth.needsRenew(uid)) return xmAuth.get(uid)
    try {
      if (kind.value === 'github') {
        const ghToken = xmAuth.githubTokenFromCookie()
        if (ghToken) {
          const t = await xmAuth.signForGithub(uid, ghToken)
          if (t) return t
        }
      } else if (kind.value === 'quick') {
        const t = await xmAuth.signForQuick(uid)
        if (t) return t
      }
      // 正式游客没有可重放凭证（密码哈希只在登录那一刻存在）→ 只能沿用旧令牌
      return xmAuth.stale(uid)
    } catch {
      return xmAuth.stale(uid)
    }
  }

  /**
   * 身份升级（M4）：把本机快速游客攒下的服务端记忆，搬到刚登录的正式账号名下。
   * 只应由「本机曾有过快速游客、刚刚登录了正式账号」这条路径调用。
   * @returns {Promise<{ok:boolean, migrated?:object, error?:string}>} 永不抛
   */
  async function upgradeFrom(fromUid) {
    const toUid = userId.value
    if (!toUid) return { ok: false, error: '未登录' }
    if (!fromUid || fromUid === toUid) return { ok: true, skipped: true }
    const t = await ensureToken({ force: true })
    if (!t) return { ok: false, error: '未取得会话令牌' }
    return migrateIdentity(fromUid, toUid, t)
  }

  shared = {
    auth,
    kind,
    userId,
    nickname,
    isLoggedIn,
    isQuickGuest,
    token,
    ensureToken,
    upgradeFrom,
    clearToken: xmAuth.clear,
    pendingQuickGuestUid,
    clearPendingQuickGuestUid,
    /** 供验收/排查：令牌与身份摘要 */
    debug: () => ({ kind: kind.value, userId: userId.value, token: xmAuth.state.value ? 'present' : 'none' }),
  }
  return shared
}
