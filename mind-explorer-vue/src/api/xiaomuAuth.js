/**
 * 会话令牌客户端（批次 M2）—— 只负责「拿令牌 / 存令牌 / 递令牌」，不做身份判断。
 *
 * 服务端一次签发、前端本地存：localStorage `xm-auth-token` = { token, exp, uid }。
 * 令牌是 base64url(payload).hmac 两段，payload 里只有 uid/kind/iat/exp，没有隐私内容。
 * 前端**只解码不验签**（exp 用于判断要不要续签）；真伪一律由服务端 verify 决定，
 * 所以即使有人改了本地 exp，也换不来任何越权能力。
 *
 * 续签时机（静默，用户无感）：
 *   剩余寿命 < 3 天，或本地根本没有令牌，或 uid 变了 → 重新签发
 *   GitHub 用户随时可再签（cookie 里有 access_token）
 *   快速游客随时可再签（本机 id，首用即信）
 *   正式游客**只在登录那一刻**能签（那时手里才有密码哈希）—— 所以 30 天有效期
 *   是它的硬边界；过期后需重新登录一次。这一取舍写在签发函数里，见 issueWithGuestProof。
 *
 * 所有失败一律静默返回 ''：令牌是「增强」而不是「前置条件」，拿不到就退回旧行为
 * （服务端过渡期允许无令牌访问），绝不能因为取令牌失败让用户说不了话。
 */
import { ref } from 'vue'
import { FUNCTIONS_BASE, edgeHeaders } from '../config'

const ENDPOINT = `${FUNCTIONS_BASE}/content`
const KEY = 'xm-auth-token'
const RENEW_WINDOW_MS = 3 * 24 * 3600 * 1000   // 与服务端 RENEW_WINDOW_SEC 对应
const FETCH_TIMEOUT = 12000

/** 当前令牌快照（响应式，供 UI 显示会话状态；业务取令牌请用 get()）
 *  { token, exp, uid, kind } | null */
const state = ref(null)
let inflight = null

// ---------- 本地存储 ----------
function readStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && typeof s.token === 'string' && s.token && typeof s.exp === 'number' ? s : null
  } catch {
    return null
  }
}

function writeStore(s) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch { /* 隐私模式：内存里仍可用，只是刷新后要重签 */ }
  state.value = s
}

/** 读 payload（只解码不验签；失败返回 null） */
function decodePayload(token) {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  try {
    const b64 = token.slice(0, dot).replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/** 启动时恢复（模块首次被引用即执行；幂等） */
state.value = readStore()

// ---------- 签发 ----------
async function requestToken(uid, proof) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: edgeHeaders(),
    body: JSON.stringify({ action: 'auth.issueToken', userId: uid, proof }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok || !data.token) return null
  return { token: data.token, exp: data.exp, uid: data.uid || uid, kind: data.kind || '' }
}

/**
 * 签发令牌（同一 uid 的并发请求会合并为一次）。
 * @returns {Promise<string>} 失败返回 ''
 */
async function sign(uid, proof) {
  if (!uid) return ''
  if (inflight && inflight.uid === uid) return inflight.promise
  const promise = (async () => {
    try {
      const s = await requestToken(uid, proof)
      if (!s) return ''
      writeStore(s)
      return s.token
    } catch {
      return ''
    }
  })()
  inflight = { uid, promise }
  promise.finally(() => { if (inflight?.promise === promise) inflight = null })
  return promise
}

export const xmAuth = {
  /** 令牌快照（响应式，仅只读用途） */
  state,

  /** 同步取「当前 uid 的可用令牌」；不需要令牌/已过期/uid 不符时返回 ''
   *  注意：过期的令牌不发出去 —— 发出去服务端会记 warn 日志，纯噪音 */
  get(uid) {
    const s = state.value
    if (!s || !uid || s.uid !== uid) return ''
    if (s.exp * 1000 <= Date.now()) return ''
    return s.token
  },

  /** 剩余寿命（ms）；无令牌或 uid 不符返回 0 */
  remaining(uid) {
    const s = state.value
    if (!s || !uid || s.uid !== uid) return 0
    return Math.max(0, s.exp * 1000 - Date.now())
  },

  /** 是否需要续签（无令牌 / 快过期 / uid 变了） */
  needsRenew(uid) {
    const s = state.value
    if (!s || !uid || s.uid !== uid) return true
    return s.exp * 1000 - Date.now() < RENEW_WINDOW_MS
  },

  /**
   * 正式游客的签发入口：**只在登录/注册成功那一刻调用**。
   * 这是唯一能向服务端证明「这个 uuid 归我」的时刻（手里有刚算出的密码哈希）。
   * 之后哈希不留存、不落盘 —— 宁可 30 天后要求重新登录，也不把口令派生值常驻在客户端。
   */
  async signForGuest(userId, username, passwordHash) {
    return sign(userId, { username, passwordHash })
  },

  /** GitHub 用户：cookie 里的 access_token 就是凭证，随时可签 */
  async signForGithub(userId, ghToken) {
    return sign(userId, { ghToken })
  },

  /** 快速游客（本机 id，无密码）：首用即信，可随时续签 */
  async signForQuick(userId) {
    return sign(userId, { kind: 'quick' })
  },

  /** 取一个「看起来可用」的令牌，不做网络请求（给请求体兜底用） */
  stale(uid) {
    const s = state.value
    return s && s.uid === uid ? s.token : ''
  },

  /** 退出登录 / 身份切换：清掉，避免把上个身份的令牌递给新身份 */
  clear() {
    writeStore(null)
    inflight = null
  },

  /** 从 GitHub cookie 里取 access_token（Netlify auth-callback 写入，JS 可读） */
  githubTokenFromCookie() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)me_user=([^;]+)/)
      if (!m) return ''
      const u = JSON.parse(atob(decodeURIComponent(m[1])))
      return typeof u?.token === 'string' ? u.token : ''
    } catch {
      return ''
    }
  },
}

/** 仅验收/排查用：返回内存中令牌的可读摘要（不泄露令牌本体） */
export function xmAuthDebug() {
  const s = state.value
  if (!s) return { hasToken: false }
  const p = decodePayload(s.token)
  return {
    hasToken: true,
    uid: s.uid,
    kind: p?.kind || s.kind,
    expISO: new Date(s.exp * 1000).toISOString(),
    daysLeft: +( (s.exp * 1000 - Date.now()) / 86400000 ).toFixed(2),
    usable: s.exp * 1000 > Date.now(),
  }
}

/* ================= 身份迁移（M4：游客升级不丢记忆） ================= */

/**
 * 请求服务端把 fromUid 名下的服务端记忆整体改归属到 toUid。
 * 幂等；失败只返回原因，不抛（升级流程不该因为迁移失败而中断）。
 */
export async function migrateIdentity(fromUid, toUid, authToken) {
  if (!fromUid || !toUid || fromUid === toUid) return { ok: true, skipped: true }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({ action: 'auth.migrate', userId: toUid, fromUid, authToken }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` }
    return data
  } catch (e) {
    return { ok: false, error: e.message || '迁移请求失败' }
  }
}

/* ---- 「本机还有个没搬走的快速游客」标记 ----
 * 为什么必须落本地：GitHub 登录是一次整页跳转（Netlify function 写 cookie 后 302 回来），
 * 过程中前端内存全丢，升级前的身份不先存下来就找不回来了。
 * 为什么用 localStorage 而非 sessionStorage：用户「今天当游客、明天登录」是常态，
 * 只用 sessionStorage 会让这个功能对大多数人失效。
 * 风控取舍：标记 7 天过期、退出登录即清 —— 限制「同一台设备换人登录」时把前一位游客的
 * 记忆并进新账号的窗口。迁移成功即清除。 */
const PENDING_KEY = 'xm-quick-pending-v1'
const PENDING_TTL_MS = 7 * 24 * 3600 * 1000

export function rememberQuickGuestUid(uid) {
  if (!uid || !/^g:g_/.test(uid)) return
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ uid, at: Date.now() })) } catch { /* 静默 */ }
}

export function pendingQuickGuestUid() {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')
    if (!raw || typeof raw.uid !== 'string') return ''
    if (Date.now() - (raw.at || 0) > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_KEY)
      return ''
    }
    return raw.uid
  } catch {
    return ''
  }
}

export function clearPendingQuickGuestUid() {
  try { localStorage.removeItem(PENDING_KEY) } catch { /* 静默 */ }
}
