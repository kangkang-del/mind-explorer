// 会话令牌与身份所有权校验（批次 M / 原「补丁 D」）
//
// 为什么需要它：`user_identifier` 目前是「可枚举的裸身份」——
//   gh:{username} 谁都能拼出来，g:{uuid} 一旦泄露即可冒充。
//   companion 的 history / clear / recap 等 action 直接拿 body.userId 去读写库，
//   没有任何所有权校验（IDOR：改个 userId 就能读/清别人的记忆）。
//
// 设计（不引入任何新依赖）：
//   token = base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(secret, 第一部分))
//   payload = { uid, kind, iat, exp }   kind: 'github' | 'guest' | 'quick'
//   - 签名密钥只存在于 Edge Secret HMAC_SECRET（后端），前端拿不到 → 无法伪造 uid
//   - 校验用 crypto.subtle.verify（原生常量时间比较），不手写字符串比较
//   - 不加密、只签名：payload 里只有 uid/kind/时间戳，无隐私内容，可安全放在客户端
//
// 过渡期双轨（关键设计，避免一次性锁死线上用户）：
//   mode='off'    HMAC_SECRET 未配置        → 鉴权未启用，行为与旧版完全一致
//   mode='warn'   无 token / token 已过期    → 保留旧行为放行 + 打一次日志
//   mode='strict' 签名有效且 uid 一致        → 正常放行
//   ok=false      签名无效 / uid 不一致      → 调用方应回 403
//
//   为什么「过期」归 warn 而不是 reject：签名本身已经证明了持有者是从我们这里
//   拿到过该 uid 的令牌，过期只是策略而非安全性边界。若硬拒，一次时钟偏差或
//   续签失败就会让用户直接说不了话。续签由前端在校验 exp 后静默完成。
//
// 注：payload 的 exp/iat 为 unix 秒；TTL 30 天，客户端在剩余 <3 天时静默续签。

const SECRET = (Deno.env.get('HMAC_SECRET') ?? '').trim()

/** 令牌有效期（秒）。30 天：够长以免打扰，够短以限制泄露窗口 */
export const TOKEN_TTL_SEC = 30 * 24 * 3600
/** 客户端建议续签窗口（秒）：剩余寿命低于此值时静默换新 */
export const RENEW_WINDOW_SEC = 3 * 24 * 3600

/** 身份格式白名单（与前端 useIdentity 的生成规则一一对应） */
export const RE_GITHUB_UID = /^gh:[A-Za-z0-9-]{1,39}$/
export const RE_GUEST_UID = /^g:[0-9a-fA-F-]{36}$/       // 正式游客：guest_users.id（UUID）
export const RE_QUICK_UID = /^g:g_[a-z0-9]{6,32}$/       // 快速游客：本地 g_ + base36

const enc = new TextEncoder()
const dec = new TextDecoder()

/** 鉴权是否已启用（HMAC_SECRET 是否配置） */
export const authEnabled = () => !!SECRET

// ---------- base64url（无 padding，URL 与 header 安全） ----------

function bytesToB64u(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function strToB64u(str) {
  return bytesToB64u(enc.encode(str))
}

function b64uToStr(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return dec.decode(bytes)
}

function b64uToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ---------- 密钥（模块级缓存：importKey 结果在实例生命周期内复用） ----------

let keyPromise = null
function hmacKey() {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }
  return keyPromise
}

// ---------- 签发 / 校验 ----------

/**
 * 签发会话令牌。
 * @param {string} uid  user_identifier（如 gh:kangkang / g:{uuid} / g:g_ab12cd34）
 * @param {string} kind 'github' | 'guest' | 'quick'
 * @param {number} ttlSec 可选，默认 30 天
 * @returns {Promise<{ token: string, exp: number, uid: string, kind: string }>}
 */
export async function signToken(uid, kind = 'guest', ttlSec = TOKEN_TTL_SEC) {
  if (!SECRET) throw new Error('HMAC_SECRET 未配置，无法签发令牌')
  const id = String(uid || '').trim()
  if (!id) throw new Error('uid 不能为空')
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + Math.max(60, Math.floor(ttlSec))
  const head = strToB64u(JSON.stringify({ uid: id, kind, iat, exp }))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(head))
  return { token: `${head}.${bytesToB64u(new Uint8Array(sig))}`, exp, uid: id, kind }
}

/**
 * 校验令牌。成功返回 payload，任何异常/不合格返回 null（调用方不区分原因，避免探测）。
 * 注意：这里**不判过期**，由 guardOwner 决定过期语义（见文件头注释）。
 * @returns {Promise<{uid:string,kind:string,iat:number,exp:number}|null>}
 */
export async function verifyToken(token) {
  if (!SECRET || typeof token !== 'string' || !token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot >= token.length - 1) return null
  const head = token.slice(0, dot)
  const sigPart = token.slice(dot + 1)
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), b64uToBytes(sigPart), enc.encode(head))
    if (!ok) return null
    const payload = JSON.parse(b64uToStr(head))
    if (!payload || typeof payload.uid !== 'string' || !payload.uid) return null
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return null
    return payload
  } catch {
    return null
  }
}

/**
 * 身份所有权守卫 —— 各 action 的统一入口。
 * @param {{ userId?: string, token?: string|null }} input
 * @returns {Promise<{ok:boolean, mode:'off'|'warn'|'strict'|'reject', reason?:string, uid?:string}>}
 *   ok=true  → 放行；mode 仅供日志/可观测性
 *   ok=false → 调用方回 403
 */
export async function guardOwner({ userId, token } = {}) {
  const uid = String(userId || '').trim()
  const tk = typeof token === 'string' ? token.trim() : ''
  // 未配置密钥（鉴权未启用）或无身份可校验（游客未登录，仅走本地）→ 保持旧行为
  if (!SECRET) return { ok: true, mode: 'off', reason: 'auth_disabled' }
  if (!uid) return { ok: true, mode: 'off', reason: 'no_identity' }
  if (!tk) return { ok: true, mode: 'warn', reason: 'token_absent' }
  const payload = await verifyToken(tk)
  if (!payload) return { ok: false, mode: 'reject', reason: 'token_invalid' }
  if (payload.uid !== uid) return { ok: false, mode: 'reject', reason: 'token_uid_mismatch' }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: true, mode: 'warn', reason: 'token_expired', uid }
  }
  return { ok: true, mode: 'strict', uid }
}

/**
 * 从请求中取令牌：优先 header `x-xm-token`，回退 body.authToken。
 * （header 便于 curl/运维手测；body 是前端主路径，且无需改 CORS 预检。）
 */
export function readToken(req, body) {
  try {
    const h = req?.headers?.get?.('x-xm-token')
    if (h) return h.trim()
  } catch { /* 非标准 req 实现，忽略 */ }
  const b = body?.authToken
  return typeof b === 'string' ? b.trim() : ''
}

/**
 * 限流日志：同一 reason+uid 每 60s 最多记一条，避免 warn 模式刷爆日志配额。
 * 仅可观测性用途，不参与任何判定。
 */
const warnSeen = new Map()
export function logGuard(mode, reason, uid, tag = '') {
  if (mode === 'strict' || mode === 'off') return
  const k = `${tag}|${mode}|${reason}`
  const now = Date.now()
  const last = warnSeen.get(k) || 0
  if (now - last < 60000) return
  warnSeen.set(k, now)
  console.warn(`[auth${tag ? ':' + tag : ''}] ${mode} ${reason} uid=${uid || '(空)'}（同因由 60s 内只记一次）`)
}
