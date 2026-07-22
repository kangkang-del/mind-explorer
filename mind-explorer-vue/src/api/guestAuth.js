/**
 * 游客账号认证 API —— 全部经 Netlify Function 中转（/.netlify/functions/guest-auth）
 * 不再直连 Supabase，不再暴露 publishable key；password_hash 由服务端持有，前端拿不到。
 *
 * 安全模型（与历史一致）：密码在前端做 SHA-256 哈希后发送，服务端只存储/比对哈希值。
 */

const ENDPOINT = '/.netlify/functions/guest-auth'

// 简易 SHA-256（浏览器原生 crypto API），避免明文在网络中传输
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function call(action, payload = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`)
  return data
}

export const guestAuthApi = {
  // 注册新游客账号
  async register(username, password, displayName) {
    const passwordHash = await hashPassword(password)
    const data = await call('register', { username, passwordHash, displayName })
    return data.user
  },

  // 游客登录（校验用户名+密码）
  async login(username, password) {
    const passwordHash = await hashPassword(password)
    const data = await call('login', { username, passwordHash })
    return data.user
  },

  // 获取游客公开信息（用于个人主页等）
  async getUserInfo(userId) {
    const data = await call('getInfo', { userId })
    return data.user
  },

  // 检查用户名是否可用（注册时实时校验）
  async checkUsernameAvailable(username) {
    try {
      const data = await call('check', { username })
      return !!data.available
    } catch {
      return false
    }
  },
}
