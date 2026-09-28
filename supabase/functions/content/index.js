// Supabase Edge Function: content
// 心灵探索「内容中转」函数（0012：自 Netlify Functions community/mood/user-cards/
// reports/sunny-push 统一迁移而来，并新增 feedback 反馈建议）
//
// 设计要点：
//   - 全部走 service_role（Edge Runtime 自动注入 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），
//     各表 RLS 启用但不设 policy，仅 service_role 可访问
//   - action 命名空间化（post.* / mood.* / card.* / report.* / feedback.* / sunny.push）
//   - 管理操作统一校验 ADMIN_PWD（Edge Secret，不写代码）
//   - 每日推送（sunny.push）：LLM 生成小木名义内容 + 外部图源，幂等，失败降级内置模板池
//   - verify_jwt=false：与原 Netlify 版一致（游客可发帖/投稿），管理面由 ADMIN_PWD 把守
//
// action 清单：
//   post.list / post.get / post.add
//   post.comments / post.comment
//   post.likes / post.likesBatch / post.myLikes / post.toggleLike
//   mood.add / mood.list
//   card.submit / card.approved / card.mine / card.get
//   card.pending / card.list / card.approve / card.reject          [admin]
//   card.feature / card.unfeature                                  [admin]
//   card.hugBatch / card.hugMine / card.hugToggle
//   report.submit / report.list [admin] / report.resolve [admin]
//   feedback.submit / feedback.list [admin] / feedback.resolve [admin]
//   sunny.push（每日 1 次，幂等；{force:true} 可强制重推）
//   auth.issueToken / auth.verify / auth.migrate                        ← 批次 M 新增
//   state.get / state.put / state.putSkin / state.clearSkin             ← 批次 N 新增
//   account.purge                                                       ← 批次 P 新增
//   model.presets / model.get / model.set / model.toggle
//   model.clear / model.test                                            ← M5 新增
//
// M5：自定义模型（用户自带 Key / 自建 endpoint）
//   配置存 xiaomu_model_config，Key 以 AES-GCM 加密落库（_shared/crypto.js，明文不落库）。
//   门槛（D6）＝**仅确权账号**（github / guest），快速游客 g:g_xxx 一律 403 ——
//   否则「清 localStorage 即换新 uid」会把本函数变成零成本匿名出网代理。
//   endpoint 过 _shared/netguard.js 的 SSRF 过滤 + L6 策略白名单（端口仅 443 / 路径仅 /v1 /
//   域名黑名单拒站点自家平台）。
//   未配 KEY_ENC_SECRET → 本组 action 返回 503，站点其余行为不受影响（可安全先上代码后配密钥）。
//
// 批次 M：身份与会话令牌（HMAC，详见 _shared/auth.js）
//   会话令牌的「签发」放在本函数（content 是数据中转定位，且游客可直连，verify_jwt=false）
//   签发必须带凭证（GitHub token / 游客密码哈希）；快速游客是本机生成的 id，首用即信。
//   校验则分散在各函数里（companion 用同一份 _shared/auth.js）。
//
// 批次 N：小木跨设备同步（外观 / 解锁 / 天数 / 自定义形象图片）
//   状态表 xiaomu_user_state（user_identifier 主键 + version 乐观锁 + payload jsonb）。
//   皮肤图片存私有桶 xiaomu-skins，读写都经本函数用 service_role 中转
//   （前端永远拿不到 Storage 密钥），读取时签发短时 URL。
//
// 批次 P：彻底删除账号（account.purge）
//   真 DELETE、无软删除残留；分两档范围 —— 核心记忆无条件删、社区足迹需显式勾选。
//   鉴权是硬要求（同 auth.migrate）：必须持有该身份的签名令牌，否则知道别人 uid
//   就能删光他的数据。三条易错边界写在 purgeIdentity 上方注释里。

import { detectCrisis, crisisReply } from '../_shared/crisis.js'
import {
  signToken,
  verifyToken,
  guardOwner,
  logGuard,
  authEnabled,
  identityStrength,
  isConfirmedKind,
  RE_GITHUB_UID,
  RE_GUEST_UID,
  RE_QUICK_UID,
} from '../_shared/auth.js'
// M5 自定义模型：用户 API Key 加密存取（明文永不落库）+ endpoint 安全校验
import { encryptSecret, decryptSecret, maskSecret, cryptoEnabled } from '../_shared/crypto.js'
import { assertSafeEndpoint, normalizeEndpoint } from '../_shared/netguard.js'

// ---------- 环境与常量 ----------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ADMIN_PWD = Deno.env.get('ADMIN_PWD') ?? ''
const LLM_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const LLM_BASE_URL = (Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const LLM_MODEL = Deno.env.get('LLM_MODEL') || 'deepseek-chat'
const memoryEnabled = !!(SUPABASE_URL && SERVICE_KEY)

// GLM 混合推理型 / DeepSeek V4+ 默认开思考，须显式关闭（与 companion 同一白名单）
const THINKING_MODEL_RE = /^(glm-(4\.[5-9]|[5-9])|deepseek-v[4-9])/
const thinkingFor = (model) =>
  THINKING_MODEL_RE.test(String(model).toLowerCase()) ? { thinking: { type: 'disabled' } } : {}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // 同步 supabase-js 客户端每请求必带的非标头：x-client-info；前端的 fetch 虽未发，
  // 但放行列表宁多勿缺，避免浏览器对偶发 client-info 预检失败。
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-xm-token, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  // 预检结果缓存 1 小时，减少后续请求的 OPTIONS 往返
  'Access-Control-Max-Age': '3600',
  vary: 'Origin',
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

const sbHeaders = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
})
const FETCH_T = 8000

// 管理员密码：Edge Secret ADMIN_PWD 优先；未配置时读 app_config 表（key=admin_pwd）
// 表内密码可随时由管理员 SQL 更新（update app_config set value=... where key='admin_pwd'），
// 读侧 60s 缓存，改密码最多 1 分钟生效。
let adminPwdCache = { value: null, at: 0 }
async function getAdminPwd() {
  if (ADMIN_PWD) return ADMIN_PWD
  if (Date.now() - adminPwdCache.at < 60000) return adminPwdCache.value
  try {
    const rows = await sbSelect('app_config', { select: 'value', key: 'eq.admin_pwd', limit: '1' })
    adminPwdCache = { value: rows[0]?.value || '', at: Date.now() }
  } catch {
    adminPwdCache = { value: '', at: Date.now() }
  }
  return adminPwdCache.value
}
async function isAdmin(pwd) {
  const expected = await getAdminPwd()
  return !!expected && !!pwd && pwd === expected
}

// ---------- Supabase REST 小封装 ----------
// 防御：值为 undefined/null 的键必须剔除——URLSearchParams 会把 undefined 序列化成
// 字符串 "undefined"（线上实证：status=undefined → PostgREST 400），mock 测试抓不到
const cleanParams = (obj) =>
  new URLSearchParams(
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)),
  )
async function sbSelect(table, params) {
  const qs = params instanceof URLSearchParams ? params.toString() : cleanParams(params).toString()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers: sbHeaders(), signal: AbortSignal.timeout(FETCH_T) })
  if (!res.ok) throw new Error(`读取 ${table} 失败 ${res.status}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}
async function sbInsert(table, row, prefer = 'return=representation') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: prefer },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(FETCH_T),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`写入 ${table} 失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  if (prefer === 'return=minimal') return null
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : null
}
async function sbPatch(table, filter, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${cleanParams(filter).toString()}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(FETCH_T),
  })
  if (!res.ok) throw new Error(`更新 ${table} 失败 ${res.status}`)
}
async function sbDelete(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${cleanParams(filter).toString()}`, {
    method: 'DELETE',
    headers: sbHeaders(),
    signal: AbortSignal.timeout(FETCH_T),
  })
  if (!res.ok && res.status !== 204) throw new Error(`删除 ${table} 失败 ${res.status}`)
}
// 需要知道「改了几行」时用（批次 M 身份迁移要汇报迁移条数）：
// 与 sbPatch 同一实现，仅把 Prefer 换成 return=representation 以取回受影响行。
async function sbPatchReturning(table, filter, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${cleanParams(filter).toString()}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(FETCH_T),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`更新 ${table} 失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows.length : 0
}

// upsert（M5 自定义模型配置用）：PostgREST 的 on_conflict + merge-duplicates。
// 为什么不用「先查再写」：两条并发请求会互相覆盖；upsert 由数据库保证原子性。
async function sbUpsert(table, row, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(FETCH_T),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`写入 ${table} 失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  return true
}

// ---------- 作者解析 ----------
function resolveAuthor(user = {}) {
  return {
    username: user.name || user.username || '匿名用户',
    user_type: user.type || (user.token ? 'github' : 'guest'),
    avatar: user.avatar || null,
  }
}

// ==================== 身份与会话（批次 M / 原「补丁 D」） ====================
// 服务端不存令牌（无状态）：签发靠 HMAC 签名，校验在 _shared/auth.js。
// 前端在登录/注册成功后立刻换取令牌，此后所有带 userId 的请求都附上它。
//
// 三种身份的凭证强度（必须如实区分，不能一律「信前端说的 userId」）：
//   gh:{login}   强 —— 拿 GitHub access_token 反过来问 api.github.com，比对 login
//   g:{uuid}     强 —— 拿 username + passwordHash 查 guest_users 表，比对 uuid 与哈希
//   g:g_xxxx     弱（首用即信）—— 本机生成的 id，无密码可言；签发令牌只是「把它变成
//                可校验的会话」，并让用户有路径升级为正式账号（auth.migrate）。
//                没有它，快速游客这条路就完全无凭据可用，等于没鉴权。

/** 用 GitHub access_token 反查登录名（不信任前端传来的 username） */
async function githubLoginOf(ghToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `token ${ghToken}`,
      'User-Agent': 'mind-explorer',
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const e = new Error(`GitHub 凭证校验失败（${res.status}）`)
    e.status = 401
    throw e
  }
  const u = await res.json().catch(() => null)
  if (!u || !u.login) {
    const e = new Error('GitHub 用户信息读取失败')
    e.status = 401
    throw e
  }
  return String(u.login)
}

async function issueToken(body) {
  if (!authEnabled()) return { ok: false, error: '服务端未配置 HMAC_SECRET，会话令牌尚未启用' }
  const userId = (body.userId || '').toString().trim()
  if (!userId) return { ok: false, error: '缺少 userId' }
  const proof = body.proof && typeof body.proof === 'object' ? body.proof : {}

  let kind
  if (RE_GITHUB_UID.test(userId)) {
    const login = userId.slice(3)
    const ghToken = (proof.ghToken || '').toString().trim()
    if (!ghToken) return { ok: false, error: '缺少 GitHub 凭证' }
    const real = await githubLoginOf(ghToken)
    if (real.toLowerCase() !== login.toLowerCase()) return { ok: false, error: 'GitHub 身份不匹配' }
    kind = 'github'
  } else if (RE_GUEST_UID.test(userId)) {
    const username = (proof.username || '').toString().trim().slice(0, 64)
    const hash = (proof.passwordHash || '').toString().trim().toLowerCase()
    if (!username || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: '缺少账号凭证' }
    const rows = await sbSelect('guest_users', {
      select: 'id,password_hash,is_banned',
      username: `eq.${username}`,
      limit: '1',
    })
    const row = rows[0]
    if (!row) return { ok: false, error: '账号不存在' }
    if (row.is_banned) return { ok: false, error: '账号已被封禁' }
    if (String(row.id) !== userId.slice(2)) return { ok: false, error: '身份不匹配' }
    if (String(row.password_hash || '').toLowerCase() !== hash) return { ok: false, error: '密码校验失败' }
    kind = 'guest'
  } else if (RE_QUICK_UID.test(userId)) {
    kind = 'quick'
  } else {
    return { ok: false, error: '不支持的身份格式' }
  }

  const signed = await signToken(userId, kind)
  return { ok: true, token: signed.token, exp: signed.exp, uid: signed.uid, kind: signed.kind }
}

async function verifySession(body) {
  const raw = (body.authToken || '').toString()
  if (!raw) return { ok: false }
  const p = await verifyToken(raw)
  if (!p) return { ok: false }
  return { ok: true, uid: p.uid, kind: p.kind, exp: p.exp, expired: p.exp < Math.floor(Date.now() / 1000) }
}

/**
 * 身份迁移：把本机快速游客（g:g_xxx）攒下的记忆，整体搬到刚注册的正式账号名下。
 * —— 这是 M4「游客升级不丢记忆」的服务端半边；客户端半边是升级后清掉本地旧 id。
 *
 * 安全约束（三条都不能松）：
 *   1. 必须持有「目标身份」的有效签名令牌 → 证明这个账号确实是调用者的；
 *   2. 源必须是快速游客（g:g_xxx）、目标必须是已确权的正式账号（g:{uuid} 或 gh:{login}）
 *      → **只允许从无密码的本机身份往外搬**，这样即使有人知道别人正式身份的 uuid/login
 *      也搬不走他的记忆（那条路上他过不了令牌这一关）；
 *   3. 只改 user_identifier，不动内容（画像遇主键冲突时合并计数与情绪轨迹）。
 *
 * 幂等：源已无数据时返回全 0；重复调用不会重复累加（源行已不存在）。
 */
async function migrateIdentity(body) {
  if (!authEnabled()) return { ok: false, error: '服务端未配置 HMAC_SECRET，会话令牌尚未启用' }
  const toUid = (body.userId || '').toString().trim()
  const fromUid = (body.fromUid || '').toString().trim()
  const migrated = { messages: 0, moods: 0, profile: 0 }
  if (!toUid || !fromUid) return { ok: false, error: '缺少 userId / fromUid' }
  if (toUid === fromUid) return { ok: true, skipped: true, migrated }

  const payload = await verifyToken((body.authToken || '').toString())
  if (!payload || payload.uid !== toUid) {
    const e = new Error('需要目标账号的会话令牌')
    e.status = 403
    throw e
  }
  if (!RE_GUEST_UID.test(toUid) && !RE_GITHUB_UID.test(toUid)) {
    const e = new Error('目标身份不是正式账号')
    e.status = 403
    throw e
  }
  if (!RE_QUICK_UID.test(fromUid)) {
    const e = new Error('仅支持从本机游客身份迁移（防止搬走他人记忆）')
    e.status = 403
    throw e
  }
  if (!memoryEnabled) return { ok: true, migrated, note: '未启用存储' }

  // 1) 对话记忆 —— 直接改归属
  migrated.messages = await sbPatchReturning('companion_messages', { user_identifier: `eq.${fromUid}` }, { user_identifier: toUid })
  // 2) 心情日记（用户主动记录的内容，跟着人走）
  migrated.moods = await sbPatchReturning('mood_diary', { user_identifier: `eq.${fromUid}` }, { user_identifier: toUid })
  // 3) 用户画像 —— 主键就是 user_identifier，目标已存在时必须「先合并、再删源」，否则主键冲突
  const [src, dst] = await Promise.all([
    sbSelect('user_profiles', { select: '*', user_identifier: `eq.${fromUid}`, limit: '1' }),
    sbSelect('user_profiles', { select: '*', user_identifier: `eq.${toUid}`, limit: '1' }),
  ])
  const s = src[0]
  const d = dst[0]
  if (s && !d) {
    await sbPatch('user_profiles', { user_identifier: `eq.${fromUid}` }, { user_identifier: toUid, updated_at: new Date().toISOString() })
    migrated.profile = 1
  } else if (s && d) {
    const hist = Array.isArray(d.emotion_history) ? d.emotion_history : []
    const shist = Array.isArray(s.emotion_history) ? s.emotion_history : []
    await sbPatch('user_profiles', { user_identifier: `eq.${toUid}` }, {
      message_count: (Number(d.message_count) || 0) + (Number(s.message_count) || 0),
      last_emotion: d.last_emotion || s.last_emotion || null,
      emotion_history: [...hist, ...shist].slice(-50),
      summary: d.summary || s.summary || null,
      nickname: d.nickname || s.nickname || null,
      updated_at: new Date().toISOString(),
    })
    await sbDelete('user_profiles', { user_identifier: `eq.${fromUid}` })
    migrated.profile = 1
  }
  return { ok: true, from: fromUid, to: toUid, migrated }
}

// ==================== 彻底删除账号（批次 P） ====================
//
// 「彻底删除」不是标记删除 —— 用户要的是**数据真的没了**，所以这里全是 DELETE，
// 没有任何 is_deleted / status 之类的软删除残留。
//
// ⚠️ 三条最容易写错的边界（详见 .workbuddy/P0-删除范围清单.md）：
//
//   ① `guest_users.id` 是**裸 UUID**，而 user_identifier 是 `g:{uuid}`。
//      直接拿 user_identifier 去删 guest_users 会静默删 0 行。
//      必须先剥前缀、**并且校验剥出来确实是 UUID** —— 否则快速游客（g:g_xxx）
//      会走到「按 id 删」分支，那是拿自己的字符串去删别人的行（越权删除）。
//
//   ② `community_posts` / `post_comments` 的用户键是 `username` 而**不是**
//      user_identifier —— 按后者删会静默删 0 行，然后我们会误报「已删干净」。
//
//   ③ 删除范围分两档：
//      · 核心数据（对话/画像/同步态/皮肤图/账号本体）→ 无条件删
//      · 社区足迹（帖子/卡片/评论/点赞/抱抱）→ **默认不删**，需 includeCommunity=true
//        社区内容涉及他人可见性，不能默认连带删。
//      而 `feedback` / `reports` 即使勾了也**不删** —— 那是站方需要留痕的处理记录。
//
// 幂等：重复调用返回全 0，不报错（第二次进来所有表都已空）。

/** 从 user_identifier 里剥出裸 UUID；不是 g:{uuid} 形态则返回 '' */
function bareGuestUuid(uid) {
  if (!RE_GUEST_UID.test(uid)) return ''
  const bare = uid.slice(2)   // 去掉 'g:'
  return RE_UUID.test(bare) ? bare : ''
}

/**
 * 删除某身份的全部数据。
 * @param {string} uid          user_identifier（gh:login / g:{uuid} / g:g_xxx）
 * @param {string} nickname     昵称（社区表按 username 匹配时需要）
 * @param {boolean} includeCommunity 是否连带删除社区足迹
 */
async function purgeIdentity(uid, nickname, includeCommunity) {
  const deleted = {}
  // 逐表删、逐表记数；单表失败不中断整体（继续删剩下的，最后在 failed 里汇报）
  const failed = []
  const del = async (label, table, filter) => {
    try {
      deleted[label] = await sbDeleteReturning(table, filter)
    } catch (e) {
      failed.push(`${label}: ${e.message}`)
    }
  }

  // ---- 1) 核心记忆（无条件删）----
  await del('messages', 'companion_messages', { user_identifier: `eq.${uid}` })
  await del('profile', 'user_profiles', { user_identifier: `eq.${uid}` })
  await del('state', 'xiaomu_user_state', { user_identifier: `eq.${uid}` })
  // 心情日记：用户主动记录的内容，但既然要「彻底删除」就一并删（前端弹窗会明确告知）
  await del('moods', 'mood_diary', { user_identifier: `eq.${uid}` })

  // ---- 2) 皮肤图片（私有桶，三个扩展名各删一次；404 幂等）----
  let skinRemoved = 0
  for (const ext of ['webp', 'png', 'jpg']) {
    try {
      await storageRemove(`${uid}/skin.${ext}`)
      skinRemoved++
    } catch { /* 单个删不掉不阻断 */ }
  }
  deleted.skinObjects = skinRemoved

  // ---- 3) 账号本体（仅正式游客；GitHub 不动其账号）----
  const bare = bareGuestUuid(uid)
  if (bare) {
    await del('guestUser', 'guest_users', { id: `eq.${bare}` })
  } else {
    deleted.guestUser = 0   // GitHub 用户 / 快速游客：没有对应的账号行
  }

  // ---- 4) 社区足迹（需显式勾选）----
  if (includeCommunity) {
    await del('postLikes', 'post_likes', { user_identifier: `eq.${uid}` })
    await del('cardHugs', 'card_hugs', { user_identifier: `eq.${uid}` })
    // 社区帖子/评论按 username 匹配（表里没有更强的用户键）
    if (nickname) {
      await del('posts', 'community_posts', { username: `eq.${nickname}` })
      await del('comments', 'post_comments', { username: `eq.${nickname}` })
      // user_cards.author_id 存的是「游客 id 或 GitHub 用户名」，两种形态都试
      await del('cardsByBare', 'user_cards', { author_id: `eq.${bare || uid.slice(3)}` })
      await del('cardsByUid', 'user_cards', { author_id: `eq.${uid}` })
    }
  }

  return { ok: true, deleted, failed, includeCommunity, scope: uid }
}

/** 删除并返回受影响行数（判「到底删掉了没有」必需 —— 静默删 0 行是这类链路最大的坑） */
async function sbDeleteReturning(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${cleanParams(filter).toString()}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    signal: AbortSignal.timeout(FETCH_T),
  })
  if (!res.ok && res.status !== 204) {
    const txt = await res.text().catch(() => '')
    throw new Error(`删除 ${table} 失败 ${res.status}: ${txt.slice(0, 160)}`)
  }
  if (res.status === 204) return 0
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows.length : 0
}

/**
 * account.purge 入口。
 * 鉴权是**硬要求**（与 auth.migrate 同级）：必须持有该身份的有效签名令牌，
 * 否则知道别人 uid 就能删光他的数据 —— 这是整个 M4 里破坏力最大的一个接口。
 */
async function purgeAccount(body) {
  if (!authEnabled()) return { ok: false, error: '服务端未配置 HMAC_SECRET，会话令牌尚未启用' }
  const uid = (body.userId || '').toString().trim()
  if (!uid) return { ok: false, error: '缺少 userId' }
  if (!RE_GITHUB_UID.test(uid) && !RE_GUEST_UID.test(uid) && !RE_QUICK_UID.test(uid)) {
    const e = new Error('身份格式不合法')
    e.status = 400
    throw e
  }

  const payload = await verifyToken((body.authToken || '').toString())
  if (!payload || payload.uid !== uid) {
    const e = new Error('需要该身份的会话令牌')
    e.status = 403
    throw e
  }
  if (!memoryEnabled) return { ok: true, deleted: {}, failed: [], note: '未启用存储' }

  const nickname = (body.nickname || '').toString().trim().slice(0, NICKNAME_MAX)
  return await purgeIdentity(uid, nickname, !!body.includeCommunity)
}

// ==================== 小木跨设备同步（批次 N） ====================
//
// 载体：xiaomu_user_state（user_identifier 主键 / version 乐观锁 / payload jsonb）
// 写入用「filter 带 version」的原子 CAS：只有版本相符才命中，0 行受影响即 409。
// 别用「先读再写」——两步之间另一个设备就能插进来，等于没锁。
//
// 皮肤图片：私有桶 xiaomu-skins，读写都经本函数（service_role），前端只拿签名 URL。
// ⚠️ 两条必须守住的边界：
//   ① payload 必须封顶 + 白名单（存储层也不能无界增长，且要防脏数据污染前端）
//   ② skin.path 必须落在调用者自己的前缀下 —— 否则 A 可以把 path 指向 B 的对象，
//      再让我们给他签一个能看 B 私有图片的 URL（IDOR）

const STATE_PAYLOAD_MAX = 16 * 1024      // payload 序列化后字符上限
const STATE_MAX_ITEMS = 64               // 解锁物品条数上限（ITEMS 现 10 件，留足余量）
const STATE_MAX_MILESTONES = 32          // 里程碑条数上限
const STATE_SKIN_BUCKET = 'xiaomu-skins'
const STATE_SKIN_MAX_BYTES = 1024 * 1024 // 皮肤图片 1MB（前端已缩到 512px，通常 <200KB）
const STATE_SKIN_SIGN_TTL = 3600         // 签名 URL 有效期（秒）
const STATE_SKIN_TYPES = ['image/webp', 'image/png', 'image/jpeg']
const STATE_TS_MAX = 4102444800000       // 2100-01-01，时间戳上界（防脏数据）

// ---------- 批次 P：彻底删除 ----------
const NICKNAME_MAX = 20                  // 与 companion 的同名常量对齐（社区表按昵称匹配时的入口截断）
const RE_UUID = /^[0-9a-fA-F-]{36}$/     // 裸 UUID（guest_users.id）；用于剥掉 'g:' 前缀后的二次校验

// ---------- M5：自定义模型配置 ----------
// 决策依据见 M5-任务清单.md：D1 用户级 / D2 后端加密存表 / D6 仅确权账号 /
//                            D12 只认自带 Key / L6 endpoint 策略白名单
const MODEL_PROVIDERS = ['zhipu', 'deepseek', 'openai', 'ollama', 'custom']
const MODEL_NAME_MAX = 80                // 模型 ID 长度上限（注入 URL 前的入口校验）
const MODEL_KEY_MAX = 200                // API Key 长度上限（超长一律可疑）
const MODEL_TABLE = 'xiaomu_model_config'

// D11 兜底开关：置 CUSTOM_MODEL_ALLOW（逗号分隔 userId）后，门槛瞬时收紧为「仅白名单」，
// 无需改代码、无需重新部署。留空 = 按 D6「确权账号」判定。
const CUSTOM_MODEL_ALLOW = (Deno.env.get('CUSTOM_MODEL_ALLOW') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// 预置平台清单（**不含任何 Key**，仅给前端下拉用）
const MODEL_PRESETS = [
  { id: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash-250414', 'glm-4.6-flash'], customEndpoint: false },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat'], customEndpoint: false },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini'], customEndpoint: false },
  { id: 'ollama', label: 'Ollama（自建）', baseUrl: '', models: ['qwen2.5:7b', 'llama3.1:8b'], customEndpoint: true },
  { id: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', models: [], customEndpoint: true },
]

// L5 限流：model.test 是唯一「服务端代发真实外网请求」的接口，不限流即为免费出网探测点
const MODEL_TEST_WINDOW_MS = 60 * 1000
const MODEL_TEST_MAX_PER_WINDOW = 3
const modelTestHits = new Map() // uid → number[]（时间戳）—— Edge 实例级，够用

const RE_ITEM_ID = /^[a-z0-9-]{1,32}$/
const RE_DAY_KEY = /^\d{8}$/

const clampInt = (v, min, max, dflt) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** 身份 id → 路径安全段（Storage 对象键不接受 ':' 等字符；同时做长度封顶） */
const safeSeg = (uid) => String(uid || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)

/**
 * 数据类 action 的所有权校验 —— 与 companion 的 ownerCheck 同源。
 * 抛出的错误带 status，由入口 catch 统一转 JSON（content 的风格是 throw 而非 return Response）。
 */
async function ownerDeny(userId, token, tag = 'content') {
  const g = await guardOwner({ userId, token })
  logGuard(g.mode, g.reason, userId, tag)
  if (g.ok) return String(userId || '').trim()
  const e = new Error('身份校验失败')
  e.status = 403
  e.reason = g.reason
  throw e
}

// ---------- M5：自定义模型的统一前置（D6 门槛 + D11 兜底开关） ----------

const modelErr = (msg, reason, status = 403) => {
  const e = new Error(msg)
  e.status = status
  e.reason = reason
  return e
}

/**
 * model.* 系列的统一前置。比 ownerDeny 更严 —— 在「是谁」之外还要问「够不够格」。
 *
 * D6：仅「确权账号」可开自定义模型 —— github / guest 放行，**quick（快速游客）拒绝**。
 *     理由（M5-任务清单 §0.1）：快速游客 g:g_xxx 无密码、首用即信、清 localStorage 即换新 uid；
 *     若放开，等于把 companion 变成一台**零成本匿名出网代理**。
 *
 * 🔴 关键易错点：**不能拿 guardOwner().ok 当「身份已确权」**——
 *    它对「无 token」「令牌过期」都是 ok=true 放行。必须走 identityStrength() 取 kind，
 *    且 kind 为空（鉴权未启用 / 无 token / 无从判定）一律视为不合格。
 */
async function requireConfirmed(userId, token, tag = 'content.model') {
  // ① 先过所有权（签名无效 / uid 不一致 → 403）
  await ownerDeny(userId, token, tag)

  // ② D11 兜底开关：白名单非空时，只有白名单内 uid 放行
  if (CUSTOM_MODEL_ALLOW.length && !CUSTOM_MODEL_ALLOW.includes(String(userId).trim())) {
    throw modelErr('自定义模型暂未对你开放', 'not_in_allowlist')
  }

  // ③ D6 身份强度门槛
  const kind = await identityStrength({ userId, token })
  if (!kind) {
    // 鉴权未启用（HMAC_SECRET 缺失）或无 token / 无从判定 —— 无法确权故不放行
    throw modelErr('请先登录后再配置自己的模型', 'identity_unknown')
  }
  if (!isConfirmedKind(kind)) {
    throw modelErr('请先注册账号（或用 GitHub 登录），再配置自己的模型', 'quick_not_allowed')
  }

  // ④ 加密功能是否就绪（未配 KEY_ENC_SECRET → 无法安全存 Key → 整体停用）
  if (!cryptoEnabled()) {
    throw modelErr('自定义模型功能尚未启用', 'feature_disabled', 503)
  }
  return { uid: String(userId).trim(), kind }
}

/** L5 限流：滑动窗口。返回 true 表示放行，false 表示超限。 */
function rateAllow(map, key, max, windowMs) {
  const now = Date.now()
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs)
  if (arr.length >= max) {
    map.set(key, arr)
    return false
  }
  arr.push(now)
  map.set(key, arr)
  // 防内存无界：定期清理冷 key（每次写入时顺带清，代价可忽略）
  if (map.size > 2000) {
    for (const [k, v] of map) {
      if (!v.length || now - v[v.length - 1] > windowMs * 10) map.delete(k)
    }
  }
  return true
}

// ---------- M5：model.* 实现 ----------

async function modelGet(body) {
  const { uid } = await requireConfirmed(body.userId, body.authToken, 'content.model.get')
  if (!memoryEnabled) return { ok: true, exists: false, note: '未启用存储' }
  const rows = await sbSelect(MODEL_TABLE, {
    // ⚠️ select 白名单：**绝不包含 key_cipher** —— 读取路径不碰密文、不解密，
    //    把解密面积压到最小（掩码是写入时算好存下的）
    select: 'provider,base_url,model,key_mask,enabled,updated_at',
    user_identifier: `eq.${uid}`,
    limit: '1',
  })
  const row = rows[0]
  if (!row) return { ok: true, exists: false }
  return {
    ok: true,
    exists: true,
    provider: row.provider || '',
    baseUrl: row.base_url || '',
    model: row.model || '',
    keyMask: row.key_mask || '',   // 掩码，非明文
    enabled: row.enabled !== false,
    updatedAt: row.updated_at || null,
  }
}

async function modelSet(body) {
  const { uid, kind } = await requireConfirmed(body.userId, body.authToken, 'content.model.set')
  if (!memoryEnabled) return { ok: false, error: '未启用存储' }

  const provider = String(body.provider || '').trim()
  if (!MODEL_PROVIDERS.includes(provider)) {
    throw modelErr('不支持的模型平台', 'bad_provider', 400)
  }

  const model = String(body.model || '').trim()
  if (!model) throw modelErr('请填写模型名称', 'model_required', 400)
  if (model.length > MODEL_NAME_MAX) throw modelErr(`模型名称过长（上限 ${MODEL_NAME_MAX} 字）`, 'model_too_long', 400)
  // 模型名会拼进 URL 与请求体，拦掉控制字符与空白
  if (/[\s\u0000-\u001f]/.test(model)) throw modelErr('模型名称含非法字符', 'model_bad_char', 400)

  // endpoint：ollama / custom 必须自带；其余平台用预置地址
  const preset = MODEL_PRESETS.find((p) => p.id === provider)
  const rawBase = preset?.customEndpoint
    ? String(body.baseUrl || '').trim()
    : String(body.baseUrl || preset?.baseUrl || '').trim()
  if (!rawBase) throw modelErr('请填写 endpoint 地址', 'base_url_required', 400)

  // L6 + L1：endpoint 策略白名单 + SSRF 静态过滤（唯一真源在 _shared/netguard.js）
  const guard = assertSafeEndpoint(rawBase)
  if (!guard.ok) throw modelErr(`endpoint 不被允许：${guard.reason}`, 'unsafe_endpoint', 400)
  const baseUrl = normalizeEndpoint(rawBase)

  // D12：用户级路径**必须自带 Key**（不许留空后回落站点 DEEPSEEK_API_KEY —— 那等于白嫖站点额度）
  const rawKey = String(body.key ?? '').trim()
  const hadKey = !!rawKey
  if (hadKey && rawKey.length > MODEL_KEY_MAX) {
    throw modelErr(`API Key 过长（上限 ${MODEL_KEY_MAX} 字）`, 'key_too_long', 400)
  }
  // 允许「只改模型不改 Key」：未传 key 时沿用库中已有密文
  let keyCipher, keyMask
  if (hadKey) {
    keyCipher = await encryptSecret(rawKey, uid)
    keyMask = maskSecret(rawKey)
  } else {
    const cur = await sbSelect(MODEL_TABLE, {
      select: 'key_cipher,key_mask',
      user_identifier: `eq.${uid}`,
      limit: '1',
    })
    keyCipher = cur[0]?.key_cipher || null
    keyMask = cur[0]?.key_mask || null
    if (!keyCipher) throw modelErr('请填写你的 API Key', 'key_required', 400)
  }

  const row = {
    user_identifier: uid,
    provider,
    base_url: baseUrl,
    model,
    key_cipher: keyCipher,
    key_mask: keyMask,
    enabled: body.enabled === false ? false : true,
    kind_at_creation: kind, // D6 留痕：便于日后「不合规时期创建的配置」批量清理
    updated_at: new Date().toISOString(),
  }
  // upsert：主键冲突时覆盖（PostgREST 的 on_conflict）
  await sbUpsert(MODEL_TABLE, row, 'user_identifier')
  return { ok: true, keyMask }
}

async function modelToggle(body) {
  const { uid } = await requireConfirmed(body.userId, body.authToken, 'content.model.toggle')
  if (!memoryEnabled) return { ok: false, error: '未启用存储' }
  const enabled = body.enabled !== false
  const hit = await sbPatchReturning(MODEL_TABLE, { user_identifier: `eq.${uid}` }, { enabled, updated_at: new Date().toISOString() })
  if (!hit) throw modelErr('尚未配置自定义模型', 'no_config', 404)
  return { ok: true, enabled }
}

async function modelClear(body) {
  const { uid } = await requireConfirmed(body.userId, body.authToken, 'content.model.clear')
  if (!memoryEnabled) return { ok: false, error: '未启用存储' }
  await sbDelete(MODEL_TABLE, { user_identifier: `eq.${uid}` })
  return { ok: true }
}

async function modelTest(body) {
  const { uid } = await requireConfirmed(body.userId, body.authToken, 'content.model.test')
  if (!memoryEnabled) return { ok: false, error: '未启用存储' }

  // L5 限流：本接口会代发一次真实外网请求，不限流即免费出网探测点
  if (!rateAllow(modelTestHits, uid, MODEL_TEST_MAX_PER_WINDOW, MODEL_TEST_WINDOW_MS)) {
    throw modelErr('测试太频繁，请稍后再试', 'rate_limited', 429)
  }

  const rows = await sbSelect(MODEL_TABLE, {
    select: 'provider,base_url,model,key_cipher,enabled',
    user_identifier: `eq.${uid}`,
    limit: '1',
  })
  const row = rows[0]
  if (!row) throw modelErr('尚未配置自定义模型', 'no_config', 404)
  if (!row.key_cipher) throw modelErr('请先填写 API Key', 'key_required', 400)

  // 落库时的校验可能已过期（历史数据 / 规则收紧），此处**再校验一次**（纵深防御）
  const guard = assertSafeEndpoint(row.base_url)
  if (!guard.ok) throw modelErr(`endpoint 不被允许：${guard.reason}`, 'unsafe_endpoint', 400)

  let key
  try {
    key = await decryptSecret(row.key_cipher, uid)
  } catch (e) {
    // AAD 不匹配 / 密文损坏 / 换了 KEY_ENC_SECRET —— 一律按「配置失效」处理，不泄露原因
    throw modelErr('密钥无法解封，请重新填写 API Key', 'key_unsealable', 400)
  }

  const t0 = Date.now()
  try {
    const res = await fetch(`${normalizeEndpoint(row.base_url)}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // 只为探活：1 个 token、明确要求不解释
      body: JSON.stringify({
        model: row.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
        ...thinkingFor(row.model),
      }),
      signal: AbortSignal.timeout(15000),
    })
    const latencyMs = Date.now() - t0
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      // 不回显上游原文（可能含账号信息）；只给状态码与截断后的短提示
      return { ok: false, latencyMs, model: row.model, error: `上游返回 ${res.status}`, detail: String(txt).slice(0, 120) }
    }
    return { ok: true, latencyMs, model: row.model }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, model: row.model, error: e.name === 'TimeoutError' ? '连接超时' : '连接失败' }
  }
}

// ---------- payload 净化（白名单 + 封顶） ----------

function sanitizePrefs(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  if (raw.variant === 'wood' || raw.variant === 'dog' || raw.variant === 'custom') out.variant = raw.variant
  const w = raw.wear
  if (w && typeof w === 'object') {
    const wear = {}
    for (const slot of ['hat', 'scarf', 'bow']) {
      const v = w[slot]
      if (typeof v === 'string' && RE_ITEM_ID.test(v)) wear[slot] = v
    }
    if (Object.keys(wear).length) out.wear = wear
  }
  if (raw.pos === null) out.pos = null
  else if (raw.pos && typeof raw.pos === 'object') {
    const x = Number(raw.pos.x)
    const y = Number(raw.pos.y)
    if (Number.isFinite(x) && Number.isFinite(y)) out.pos = { x: clampInt(x, -100000, 100000, 0), y: clampInt(y, -100000, 100000, 0) }
  }
  if (typeof raw.collapsed === 'boolean') out.collapsed = raw.collapsed
  if (typeof raw.dnd === 'boolean') out.dnd = raw.dnd
  return out
}

function sanitizeUnlocks(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  if (Array.isArray(raw.items)) {
    const uniq = new Set()
    for (const v of raw.items) {
      if (typeof v !== 'string' || !RE_ITEM_ID.test(v)) continue
      uniq.add(v)
      if (uniq.size >= STATE_MAX_ITEMS) break
    }
    out.items = [...uniq]
  }
  if (raw.ms && typeof raw.ms === 'object') {
    const ms = {}
    for (const [k, v] of Object.entries(raw.ms)) {
      if (!RE_ITEM_ID.test(k)) continue
      const t = Number(v)
      if (!Number.isFinite(t)) continue
      ms[k] = clampInt(t, 0, STATE_TS_MAX, 0)
      if (Object.keys(ms).length >= STATE_MAX_MILESTONES) break
    }
    out.ms = ms
  }
  return out
}

function sanitizeActiveDays(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  return {
    days: clampInt(raw.days, 0, 100000, 0),
    last: typeof raw.last === 'string' && RE_DAY_KEY.test(raw.last) ? raw.last : '',
  }
}

/** 皮肤元数据：path 必须落在自己的前缀下（见文件段首 ⚠️②） */
function sanitizeSkinMeta(raw, uid) {
  if (!raw || typeof raw !== 'object') return undefined
  const path = typeof raw.path === 'string' ? raw.path : ''
  if (!path || !path.startsWith(`${safeSeg(uid)}/`)) return undefined
  const type = STATE_SKIN_TYPES.includes(raw.type) ? raw.type : ''
  if (!type) return undefined
  return {
    path: path.slice(0, 160),
    w: clampInt(raw.w, 1, 4096, 0),
    h: clampInt(raw.h, 1, 4096, 0),
    type,
    at: clampInt(raw.at, 0, STATE_TS_MAX, 0),
  }
}

function sanitizeState(raw, uid) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  const prefs = sanitizePrefs(src.prefs)
  if (Object.keys(prefs).length) out.prefs = prefs
  const unlocks = sanitizeUnlocks(src.unlocks)
  if (Object.keys(unlocks).length) out.unlocks = unlocks
  const ad = sanitizeActiveDays(src.activeDays)
  if (ad) out.activeDays = ad
  const skin = sanitizeSkinMeta(src.skin, uid)
  if (skin) out.skin = skin
  return out
}

// ---------- Storage（私有桶，全部经 service_role 中转） ----------

const storageObjUrl = (path) =>
  `${SUPABASE_URL}/storage/v1/object/${STATE_SKIN_BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`

async function storagePut(path, bytes, contentType) {
  const res = await fetch(storageObjUrl(path), {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'cache-control': 'max-age=3600',
      'x-upsert': 'true',
    },
    body: bytes,
    signal: AbortSignal.timeout(FETCH_T * 2),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`上传形象图片失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
}

async function storageRemove(path) {
  const res = await fetch(storageObjUrl(path), {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(FETCH_T),
  })
  // 404 视为已不存在（幂等）
  if (!res.ok && res.status !== 404) throw new Error(`删除形象图片失败 ${res.status}`)
}

/** 签发短时访问 URL。失败返回 ''——读状态不能因为签不出图 URL 而整体失败 */
async function storageSign(path, ttlSec = STATE_SKIN_SIGN_TTL) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${STATE_SKIN_BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({ expiresIn: ttlSec }),
        signal: AbortSignal.timeout(FETCH_T),
      },
    )
    if (!res.ok) return ''
    const data = await res.json()
    const rel = data?.signedURL || data?.signedUrl || ''
    if (!rel) return ''
    return rel.startsWith('http') ? rel : `${SUPABASE_URL}/storage/v1${rel}`
  } catch {
    return ''
  }
}

/** 换扩展名后清掉同目录其它皮肤对象（webp/png/jpg 只保留一个），避免残渣 */
async function storageRemoveSiblings(seg, keepPath) {
  const others = ['webp', 'png', 'jpg']
    .map((e) => `${seg}/skin.${e}`)
    .filter((p) => p !== keepPath)
  await Promise.all(others.map((p) => storageRemove(p).catch(() => {})))
}

function b64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------- action ----------

async function stateGet(body) {
  const userId = String(body.userId || '').trim()
  await ownerDeny(userId, body.authToken, 'content.state')
  if (!memoryEnabled) return { ok: true, exists: false, version: 0, payload: null, note: '未启用存储' }
  const rows = await sbSelect('xiaomu_user_state', {
    select: 'version,payload,updated_at',
    user_identifier: `eq.${userId}`,
    limit: '1',
  })
  const row = rows[0]
  if (!row) return { ok: true, exists: false, version: 0, payload: null }
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  // 皮肤元数据附带短时签名 URL，前端可直接 <img src>
  const skin = payload.skin && payload.skin.path
    ? { ...payload.skin, url: await storageSign(payload.skin.path) }
    : null
  return {
    ok: true,
    exists: true,
    version: clampInt(row.version, 0, Number.MAX_SAFE_INTEGER, 0),
    payload: skin ? { ...payload, skin } : payload,
    updatedAt: row.updated_at || null,
  }
}

async function statePut(body) {
  const userId = String(body.userId || '').trim()
  await ownerDeny(userId, body.authToken, 'content.state')
  if (!memoryEnabled) return { ok: false, error: '未启用存储' }

  const payload = sanitizeState(body.payload, userId)
  if (JSON.stringify(payload).length > STATE_PAYLOAD_MAX) {
    const e = new Error('同步数据过大')
    e.status = 413
    throw e
  }

  const clientVersion = clampInt(body.version, 0, Number.MAX_SAFE_INTEGER, 0)

  // 1) 客户端说「服务端还没有」（version=0）→ 插入；已存在则是并发抢先，按冲突处理
  if (!clientVersion) {
    try {
      const row = await sbInsert('xiaomu_user_state', {
        user_identifier: userId,
        version: 1,
        payload,
        updated_at: new Date().toISOString(),
      })
      return { ok: true, version: clampInt(row?.version, 1, Number.MAX_SAFE_INTEGER, 1), created: true }
    } catch (err) {
      if (/409|[Cc]onflict|duplicate key|23505/.test(String(err?.message || ''))) {
        const e = new Error('同步版本冲突')
        e.status = 409
        throw e
      }
      throw err
    }
  }

  // 2) 原子 CAS：filter 带 version，只有版本相符才命中
  const next = clientVersion + 1
  const hit = await sbPatchReturning(
    'xiaomu_user_state',
    { user_identifier: `eq.${userId}`, version: `eq.${clientVersion}` },
    { version: next, payload, updated_at: new Date().toISOString() },
  )
  if (!hit) {
    const e = new Error('同步版本冲突')
    e.status = 409
    throw e
  }
  return { ok: true, version: next }
}

async function statePutSkin(body) {
  const userId = String(body.userId || '').trim()
  await ownerDeny(userId, body.authToken, 'content.skin')
  if (!memoryEnabled) return { ok: false, error: '未启用存储' }

  // 接受 dataURL 或裸 base64；mime 优先取自 dataURL 前缀
  const rawData = typeof body.data === 'string' ? body.data : ''
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/is.exec(rawData)
  const type = (m ? m[1] : String(body.type || '')).toLowerCase()
  if (!STATE_SKIN_TYPES.includes(type)) {
    const e = new Error('请上传 png / jpg / webp 图片')
    e.status = 400
    throw e
  }
  const b64 = (m ? m[2] : rawData).replace(/\s+/g, '')
  // 先按 base64 长度估算再解码：不能为了「拒绝」而先解一个几十 MB 的字符串
  if (b64.length > Math.ceil((STATE_SKIN_MAX_BYTES * 4) / 3) + 64) {
    const e = new Error('图片超过 1MB 上限')
    e.status = 413
    throw e
  }
  let bytes
  try {
    bytes = b64ToBytes(b64)
  } catch {
    const e = new Error('图片数据不是有效的 base64')
    e.status = 400
    throw e
  }
  if (!bytes.length) {
    const e = new Error('图片数据为空')
    e.status = 400
    throw e
  }
  if (bytes.length > STATE_SKIN_MAX_BYTES) {
    const e = new Error('图片超过 1MB 上限')
    e.status = 413
    throw e
  }

  const seg = safeSeg(userId)
  const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp'
  const path = `${seg}/skin.${ext}`
  await storagePut(path, bytes, type)
  await storageRemoveSiblings(seg, path)

  const skin = {
    path,
    w: clampInt(body.w, 1, 4096, 0),
    h: clampInt(body.h, 1, 4096, 0),
    type,
    at: Date.now(),
  }
  return { ok: true, skin: { ...skin, url: await storageSign(path) } }
}

async function stateClearSkin(body) {
  const userId = String(body.userId || '').trim()
  await ownerDeny(userId, body.authToken, 'content.skin')
  if (!memoryEnabled) return { ok: true, removed: 0 }
  const seg = safeSeg(userId)
  const marked = await Promise.all(
    ['webp', 'png', 'jpg'].map((e) => storageRemove(`${seg}/skin.${e}`).then(() => 1).catch(() => 0)),
  )
  return { ok: true, removed: marked.reduce((a, b) => a + b, 0) }
}

// ==================== 帖子（community_posts） ====================
async function addPost(body) {
  const title = (body.title || '').toString().trim()
  const content = (body.content || '').toString().trim()
  if (!title || !content) throw new Error('标题和内容都不能为空')
  if (title.length > 100) throw new Error('标题请控制在 100 字以内')
  if (content.length > 5000) throw new Error('内容请控制在 5000 字以内')
  const a = resolveAuthor(body.user || {})
  const created = await sbInsert('community_posts', {
    title,
    content,
    username: a.username,
    user_type: a.user_type,
    avatar: a.avatar,
    type: (body.type || 'user').toString().trim() || 'user',
    category: (body.category || 'general').toString().trim() || 'general',
    image: (body.image || '').toString().trim() || null,
    is_auto_push: false,
  })
  const crisis = detectCrisis(`${title} ${content}`)
  return { ok: true, post: created, crisis }
}

async function listComments(postId) {
  return sbSelect('post_comments', { select: '*', post_id: `eq.${postId}`, order: 'created_at.asc' })
}
async function addComment(body) {
  const content = (body.content || '').toString().trim()
  if (!content) throw new Error('评论内容不能为空')
  const a = resolveAuthor(body.user || {})
  const created = await sbInsert('post_comments', {
    post_id: body.postId,
    content,
    username: a.username,
    user_type: a.user_type,
    avatar: a.avatar,
  })
  return { ok: true, comment: created }
}
async function likesBatch(ids) {
  if (!ids || !ids.length) return {}
  const rows = await sbSelect('post_likes', { select: 'post_id', post_id: `in.(${ids.join(',')})` })
  const map = {}
  for (const r of rows) if (r.post_id) map[r.post_id] = (map[r.post_id] || 0) + 1
  return map
}
async function myLikes(ids, identifier) {
  if (!ids || !ids.length || !identifier) return []
  const rows = await sbSelect('post_likes', { select: 'post_id', post_id: `in.(${ids.join(',')})`, user_identifier: `eq.${identifier}` })
  return rows.map((r) => r.post_id)
}
async function toggleLike(body) {
  const { postId, user_identifier: identifier, user_type: userType } = body
  if (!postId || !identifier) throw new Error('缺少帖子或用户标识')
  const existing = await sbSelect('post_likes', { select: 'id', post_id: `eq.${postId}`, user_identifier: `eq.${identifier}`, limit: '1' })
  if (existing.length) {
    await sbDelete('post_likes', { post_id: postId, user_identifier: identifier })
    return { liked: false }
  }
  await sbInsert('post_likes', { post_id: postId, user_identifier: identifier, user_type: userType || null }, 'return=minimal')
  return { liked: true }
}

// ==================== 心情日记（mood_diary） ====================
// [PATCH-mood-note 2026-09-22] note 长度上限，与前端 Mood.vue 的 maxlength=120 对齐。
// 前端 maxlength 拦不住直接调 API 的请求；mood_diary.note 是无约束 text，服务端截断是最后一道防线。
const MOOD_NOTE_MAX = 120
// 危机检测扫描上限：detectCrisis 是关键词 includes 全串扫描，限制输入长度防超长 payload 拖慢。
const MOOD_NOTE_SCAN_MAX = 2000
// [PATCH-mood-emotion 2026-09-22] emotion 同样是 text NOT NULL 无约束，原先只判空值不判长度。
// 前端只传情绪 key（如 anxious/low/angry/lost/calm/grateful），40 字上限留足余量。
const MOOD_EMOTION_MAX = 40

async function addMood(body) {
  const userId = (body.userId || '').toString().trim()
  const emotion = (body.emotion || '').toString().trim().slice(0, MOOD_EMOTION_MAX)
  if (!userId || !emotion) throw new Error('缺少 userId 或 emotion')
  const rawNote = typeof body.note === 'string' ? body.note : ''
  const note = rawNote.trim().slice(0, MOOD_NOTE_MAX) || null
  // 危机检测用原文（截断到 2000 字），避免截断把高危词切掉
  const crisis = detectCrisis(rawNote.slice(0, MOOD_NOTE_SCAN_MAX))
  await sbInsert('mood_diary', { user_identifier: userId, emotion, note }, 'return=minimal')
  return { ok: true, crisis }
}
async function listMood(body) {
  const userId = (body.userId || '').toString().trim()
  if (!userId) return { entries: [] }
  const since = new Date(Date.now() - (Number(body.days) || 30) * 86400000).toISOString()
  const entries = await sbSelect('mood_diary', {
    select: 'emotion,note,created_at',
    user_identifier: `eq.${userId}`,
    created_at: `gte.${since}`,
    order: 'created_at.asc',
  })
  return { entries }
}

// ==================== 治愈瞬间投稿（user_cards + card_hugs） ====================
function shapeCard(row) {
  if (!row) return null
  return {
    id: row.id, title: row.title, content: row.content,
    category: row.category || '', summary: row.summary || '', source: row.source || '',
    author_id: row.author_id || '', author_name: row.author_name || '匿名', author_type: row.author_type || 'guest',
    image: row.image || '', status: row.status || 'pending',
    views: row.views || 0, likes: row.likes || 0, hugs: row.hugs || 0,
    featured: !!row.featured, created_at: row.created_at,
    reviewed_at: row.reviewed_at || null, reviewer: row.reviewer || '',
  }
}
async function listCards(filter) {
  const rows = await sbSelect('user_cards', { select: '*', order: 'created_at.desc', ...filter })
  return rows.map(shapeCard)
}
async function submitCard(body) {
  const title = (body.title || '').toString().trim()
  const content = (body.content || '').toString().trim()
  if (!title || !content) throw new Error('标题和内容不能为空')
  if (title.length > 60) throw new Error('标题请控制在 60 字以内')
  if (content.length > 2000) throw new Error('内容请控制在 2000 字以内')
  const created = await sbInsert('user_cards', {
    title,
    content,
    category: (body.category || '').toString().trim() || null,
    summary: (body.summary || '').toString().trim() || null,
    source: (body.source || '').toString().trim() || null,
    author_id: (body.author_id || '').toString().trim() || null,
    author_name: (body.author_name || '').toString().trim() || '匿名',
    author_type: (body.author_type || 'guest').toString().trim(),
    image: (body.image || '').toString().trim() || null,
    status: 'pending',
  })
  const crisis = detectCrisis(`${title} ${content}`)
  return { ok: true, id: created?.id || null, crisis }
}
async function reviewCard(body, newStatus) {
  if (!body.id) throw new Error('缺少 id')
  await sbPatch('user_cards', { id: `eq.${body.id}` }, { status: newStatus, reviewed_at: new Date().toISOString(), reviewer: 'admin' })
  return { ok: true }
}
// 抱抱（去规范化计数：低并发下读改写可接受）
async function hugCountOf(cardId) {
  const rows = await sbSelect('user_cards', { select: 'hugs', id: `eq.${cardId}`, limit: '1' })
  return rows[0]?.hugs || 0
}
async function toggleHug(body) {
  const { cardId, user_identifier: uid, user_type: ut } = body
  if (!cardId || !uid) throw new Error('缺少卡片或用户标识')
  const existing = await sbSelect('card_hugs', { select: 'id', card_id: `eq.${cardId}`, user_identifier: `eq.${uid}`, limit: '1' })
  if (existing.length) {
    await sbDelete('card_hugs', { card_id: cardId, user_identifier: uid })
    await sbPatch('user_cards', { id: `eq.${cardId}` }, { hugs: Math.max(0, (await hugCountOf(cardId)) - 1) })
    return { hugged: false, count: await hugCountOf(cardId) }
  }
  await sbInsert('card_hugs', { card_id: cardId, user_identifier: uid, user_type: ut || null }, 'return=minimal')
  await sbPatch('user_cards', { id: `eq.${cardId}` }, { hugs: (await hugCountOf(cardId)) + 1 })
  return { hugged: true, count: await hugCountOf(cardId) }
}

// ==================== 举报（reports） ====================
async function submitReport(body) {
  const target_type = (body.target_type || '').toString().trim()
  const target_id = (body.target_id || '').toString().trim()
  const reason = (body.reason || '').toString().trim()
  if (!['user_card', 'community_post'].includes(target_type)) throw new Error('无效的目标类型')
  if (!target_id) throw new Error('缺少目标标识')
  if (!reason) throw new Error('请选择举报理由')
  await sbInsert('reports', {
    target_type, target_id,
    reporter_id: (body.reporter_id || '').toString().trim() || null,
    reporter_type: (body.reporter_type || '').toString().trim() || null,
    reason,
    detail: (body.detail || '').toString().trim() || null,
    status: 'open',
  }, 'return=minimal')
  return { ok: true }
}

// ==================== 反馈建议（feedback，0012 新增） ====================
async function submitFeedback(body) {
  const content = (body.content || '').toString().trim()
  if (!content) throw new Error('反馈内容不能为空')
  if (content.length > 2000) throw new Error('内容请控制在 2000 字以内')
  const type = ['suggest', 'issue', 'thanks'].includes(body.type) ? body.type : 'suggest'
  await sbInsert('feedback', {
    type,
    content,
    anonymous: !!body.anonymous,
    user_id: body.anonymous ? null : (body.userId || '').toString().trim() || null,
    user_name: body.anonymous ? null : (body.userName || '').toString().trim() || null,
    status: 'open',
  }, 'return=minimal')
  return { ok: true }
}

// ==================== 每日推送（sunny.push，0012 升级） ====================
// 北京时间今日 0 点（UTC ISO），幂等窗口
function todayStartBeijingISO() {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
  beijing.setUTCHours(0, 0, 0, 0)
  return new Date(beijing.getTime() - 8 * 3600 * 1000).toISOString()
}
const rand = (n) => Math.floor(Math.random() * n)
const pick = (arr) => arr[rand(arr.length)]
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 外部图源（均无需 Key）
async function fetchDogImage() {
  try {
    const r = await fetch('https://dog.ceo/api/breeds/image/random', { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    return d.status === 'success' ? d.message : null
  } catch {
    return null
  }
}
function fetchCatImage() {
  return `https://cataas.com/cat?t=${Date.now()}-${rand(1e6)}`
}
function fetchNatureImage(seed) {
  return `https://picsum.photos/seed/${seed}/600/400`
}

// LLM 单次调用（OpenAI 兼容；glm-4.7-flash 自动关思考；失败抛错由调用方降级）
async function aiChat(system, user, maxTokens = 900) {
  const r = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${LLM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.9,
      max_tokens: maxTokens,
      ...thinkingFor(LLM_MODEL),
    }),
  })
  if (r.status === 400 && THINKING_MODEL_RE.test(LLM_MODEL)) {
    // 平台不认 thinking 字段 → 摘除重试一次
    const r2 = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Bearer ${LLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.9,
        max_tokens: maxTokens,
      }),
    })
    if (!r2.ok) throw new Error(`LLM ${r2.status}`)
    const d2 = await r2.json()
    return d2.choices?.[0]?.message?.content || ''
  }
  if (!r.ok) throw new Error(`LLM ${r.status}`)
  const d = await r.json()
  return d.choices?.[0]?.message?.content || ''
}

// 解析 LLM 返回的 JSON（容忍 ```json 围栏与前后杂文）
function parseJsonLoose(text) {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('LLM 返回非 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

// 一次调用生成今日全部文案：善意 3 + 治愈瞬间 3 + 小木语录 1
async function generateDailyContent() {
  const system =
    '你是「心灵探索」网站的内容编辑，同时扮演网站角色「小木」——一位研究心理学与哲学的同行者，语气温柔、有哲思、不评判、不煽情。你将为一台内容流水线产出当天全部文案，必须严格按 JSON 返回。'
  const user = `请生成今日内容，返回 JSON（不要多余文字）：
{"kindness":[{"title":"善意行为小故事标题","content":"善意小故事，1-2句，真实克制，像身边发生的事"}],
 "healing":[{"title":"治愈瞬间标题(20字内)","content":"治愈瞬间正文，60-150字，第一人称视角的小确幸/暖心/成长片段，细腻不矫情","category":"暖心|成长|小确幸 三选一"}],
 "quote":"小木今日语录：温柔、有哲学意味、不评判、1-2句，给可能疲惫的人一点安抚"}
要求：kindness 3 条、healing 3 条，条条互不重复、不使用网络流行语。`

  const fallback = {
    kindness: shuffle(KINDNESS_POOL).slice(0, 3),
    healing: shuffle(HEALING_POOL).slice(0, 3),
    quote: pick(QUOTE_POOL),
  }
  try {
    const text = await aiChat(system, user, 1200)
    const parsed = parseJsonLoose(text)
    const kindness = (Array.isArray(parsed.kindness) && parsed.kindness.length
      ? parsed.kindness : fallback.kindness).slice(0, 3).map((k) => ({
        title: (k.title || '今日善意').toString().slice(0, 60),
        content: (k.content || '').toString().slice(0, 500),
      }))
    const healing = (Array.isArray(parsed.healing) && parsed.healing.length
      ? parsed.healing : fallback.healing).slice(0, 3).map((h) => ({
        title: (h.title || '一个治愈瞬间').toString().slice(0, 60),
        content: (h.content || '').toString().slice(0, 2000),
        category: ['暖心', '成长', '小确幸'].includes(h.category) ? h.category : '暖心',
      }))
    const quote = (parsed.quote || fallback.quote).toString().trim().slice(0, 200).replace(/^["“”]|["“”]$/g, '')
    return { kindness, healing, quote, source: 'llm' }
  } catch (e) {
    console.error('生成每日内容失败，降级模板池：', e.message)
    return { ...fallback, source: 'template' }
  }
}

// 每日一卡（cards 资产摘要池，部署时内嵌；与 sunny-push 旧版同源但只存 id/标题/摘要）
const DAILY_CARDS = [{"id":1,"t":"锚定效应 (Anchoring Effect)","s":"做判断时过度依赖最先获得的信息（锚点），即使该信息与当前决策无关。","cat":"认知偏差"},{"id":2,"t":"确认偏误 (Confirmation Bias)","s":"倾向于寻找、解释和记忆能证实自己已有信念的信息，同时忽略相反的证据。","cat":"认知偏差"},{"id":3,"t":"可得性启发 (Availability Heuristic)","s":"人们倾向于根据某事件在脑海中浮现的容易程度来判断其发生概率。","cat":"认知偏差"},{"id":4,"t":"框架效应 (Framing Effect)","s":"同一问题的不同表述方式（框架）会显著影响人们的选择和判断。","cat":"认知偏差"},{"id":5,"t":"沉没成本谬误 (Sunk Cost Fallacy)","s":"因为已经投入了不可收回的成本，而继续坚持一个不利的选择。","cat":"认知偏差"},{"id":6,"t":"损失规避 (Loss Aversion)","s":"人们对损失的感受强度约为同等收益的2-2.5倍。失去100元的痛苦大于得到100元的快乐。","cat":"认知偏差"},{"id":7,"t":"禀赋效应 (Endowment Effect)","s":"一旦拥有某物品，对其价值的评价会显著高于拥有之前。","cat":"认知偏差"},{"id":8,"t":"当下偏差 (Present Bias)","s":"倾向于高估即时回报、低估未来回报，导致拖延和冲动决策。","cat":"认知偏差"},{"id":9,"t":"赌徒谬误 (Gambler's Fallacy)","s":"错误地认为独立随机事件之间存在关联，认为连续发生的事件下次概率会改变。","cat":"认知偏差"},{"id":10,"t":"基本比率谬误 (Base Rate Fallacy)","s":"在判断概率时过度关注具体个案信息，而忽略或低估基本比率（先验概率）。","cat":"认知偏差"},{"id":11,"t":"达克效应 (Dunning-Kruger Effect)","s":"能力不足的人无法认识到自己的不足，反而高估自己的能力。真正的专家则倾向于低估自己。","cat":"认知偏差"},{"id":12,"t":"基本归因谬误 (Fundamental Attribution Error)","s":"解释他人行为时过度归因于内在特质，而低估情境因素的影响。","cat":"认知偏差"},{"id":13,"t":"盲点偏见 (Bias Blind Spot)","s":"认为别人有偏见，但自己没有。人们更容易识别他人的认知偏差而非自己的。","cat":"认知偏差"},{"id":14,"t":"乐观偏差 (Optimism Bias)","s":"高估自己经历积极事件的可能性，低估经历消极事件的可能性。","cat":"认知偏差"},{"id":15,"t":"从众效应 (Bandwagon Effect)","s":"因为很多人相信或做某件事，自己也倾向于相信或做这件事。","cat":"认知偏差"},{"id":16,"t":"权威偏见 (Authority Bias)","s":"倾向于认为权威人士的意见更准确、更可信，即使在其专业领域之外。","cat":"认知偏差"},{"id":17,"t":"群内偏差 (Ingroup Bias)","s":"倾向于偏爱自己所属的群体及其成员，对外群体持更负面的态度。","cat":"认知偏差"},{"id":18,"t":"晕轮效应 (Halo Effect)","s":"对某人或某物的一个正面特质产生好感后，这种好感会「晕染」到对其整体的评价。","cat":"认知偏差"},{"id":19,"t":"巴纳姆效应 (Barnum Effect)","s":"人们倾向于认为模糊、普遍的人格描述特别适合自己，是星座和性格测试的心理基础。","cat":"认知偏差"},{"id":20,"t":"旁观者效应 (Bystander Effect)","s":"紧急情况下，旁观者越多，每个人提供帮助的可能性越低。","cat":"认知偏差"},{"id":21,"t":"后见之明偏差 (Hindsight Bias)","s":"事件发生后，倾向于认为'我早就知道会这样'，高估自己事前的预测能力。","cat":"认知偏差"},{"id":22,"t":"蔡格尼克效应 (Zeigarnik Effect)","s":"人们对未完成任务的记忆比已完成任务更深刻。未完成的事会在脑海中持续占据空间。","cat":"认知偏差"},{"id":23,"t":"峰终定律 (Peak-End Rule)","s":"人们对一段体验的记忆主要取决于高峰时刻和结束时刻的感受，而非体验的平均值。","cat":"认知偏差"},{"id":24,"t":"宜家效应 (IKEA Effect)","s":"对自己亲手创造或组装的东西赋予不成比例的高价值。","cat":"认知偏差"},{"id":25,"t":"前景理论 (Prospect Theory)","s":"描述人们在风险和不确定性下如何做决策，是行为经济学的基石。由 Kahneman 和 Tversky 提出，获得2002年诺贝尔经济学奖。","cat":"行为经济学"},{"id":26,"t":"心理账户 (Mental Accounting)","s":"人们将金钱划分到不同的'心理账户'中，每个账户有不同的使用规则，导致非理性的消费和投资决策。","cat":"行为经济学"},{"id":27,"t":"助推理论 (Nudge Theory)","s":"通过精心设计选择架构，以非强制的方式引导人们做出更好的决策，同时保留自由选择权。","cat":"行为经济学"},{"id":28,"t":"现状偏见 (Status Quo Bias)","s":"人们倾向于维持现状，即使改变更有利也不愿行动。默认选项有巨大的力量。","cat":"行为经济学"},{"id":29,"t":"双曲贴现 (Hyperbolic Discounting)","s":"人们对即时回报的偏好远大于未来回报，导致时间不一致的决策。","cat":"行为经济学"},{"id":30,"t":"社会规范 (Social Norms)","s":"人们的行为深受他人行为和期望的影响。告知'大多数人做了什么'是强大的行为改变工具。","cat":"行为经济学"},{"id":31,"t":"选择过载 (Choice Overload)","s":"当选项过多时，人们反而更难做出决定，满意度下降，甚至放弃选择。","cat":"行为经济学"},{"id":32,"t":"诱饵效应 (Decoy Effect)","s":"引入一个明显较差的选项（诱饵），可以让目标选项显得更有吸引力。","cat":"行为经济学"},{"id":33,"t":"热手谬误 (Hot Hand Fallacy)","s":"错误地认为连续成功之后更可能继续成功，源于对随机序列的误解。","cat":"行为经济学"},{"id":34,"t":"凡勃仑效应 (Veblen Effect)","s":"商品价格越高，需求反而越大。消费者通过高价商品展示社会地位。","cat":"行为经济学"},{"id":35,"t":"交易效用理论 (Transaction Utility)","s":"消费者的满意度不仅取决于商品本身的价值，还取决于交易的「公平感」——感觉「占了便宜」带来的额外满足。","cat":"行为经济学"},{"id":36,"t":"默认选项效应 (Default Effect)","s":"人们极大概率会接受预设的默认选项，即使改变选项的成本很低。这是助推最有力的工具之一。","cat":"行为经济学"},{"id":37,"t":"斯坦福监狱实验","s":"1971年津巴多将大学生随机分为囚犯和看守，原计划两周的实验仅六天因过激行为终止。证明情境和角色对人的行为有巨大影响。","cat":"经典实验"},{"id":38,"t":"米尔格拉姆服从实验","s":"1961年实验发现65%的参与者愿意在权威指令下对他人施加致命电击。揭示了权威服从的强大力量。","cat":"经典实验"},{"id":39,"t":"棉花糖实验 (延迟满足)","s":"研究儿童延迟满足能力。能等待15分钟获得两颗棉花糖的儿童，多年后在学业和生活中表现更好。","cat":"经典实验"},{"id":40,"t":"阿希从众实验","s":"1951年实验证明，即使明显错误的群体判断也能让个体从众。约75%的人至少从众一次。","cat":"经典实验"},{"id":41,"t":"波波玩偶实验 (社会学习理论)","s":"班杜拉1961年证明儿童会通过观察和模仿习得攻击行为，奠定了社会学习理论的基础。","cat":"经典实验"},{"id":42,"t":"罗森塔尔实验 (皮格马利翁效应)","s":"教师被告知某些学生是'潜力股'（实际随机挑选），结果这些学生成绩真的显著提高。","cat":"经典实验"},{"id":43,"t":"习得性无助实验","s":"动物（和人类）在反复经历无法控制的负面事件后，会学会放弃努力，即使后来可以逃脱。","cat":"经典实验"},{"id":44,"t":"小阿尔伯特实验 (恐惧条件化)","s":"华生1920年证明恐惧可以通过经典条件反射习得和泛化，9个月大的婴儿被条件化害怕白鼠。","cat":"经典实验"},{"id":45,"t":"感觉剥夺实验","s":"1954年实验证明，大脑的正常发育和功能维持需要持续的外界感官刺激。完全剥夺感觉会导致幻觉和认知紊乱。","cat":"经典实验"},{"id":46,"t":"霍桑效应实验","s":"被关注本身就能改变行为。工厂工人因为知道自己被观察而提高生产效率。","cat":"经典实验"},{"id":47,"t":"记忆可靠性实验 (误导信息效应)","s":"Loftus证明记忆可以被事后信息改变甚至植入。提问方式能影响目击证人的记忆。","cat":"经典实验"},{"id":48,"t":"人际吸引增减原则实验","s":"'先否定后肯定'比'一直肯定'更能获得好感。态度的变化方向比态度的绝对值更重要。","cat":"经典实验"},{"id":49,"t":"科尔伯格道德发展实验","s":"通过道德两难故事研究道德推理的发展阶段，提出道德发展的三水平六阶段理论。","cat":"经典实验"},{"id":50,"t":"反馈效应实验","s":"及时反馈比延时反馈更能促进学习。知道结果的学习效率远高于不知道结果。","cat":"经典实验"},{"id":51,"t":"定位速效法实验","s":"目标明确、进度可见可以显著提高完成任务的效率。","cat":"经典实验"},{"id":52,"t":"执行猴实验","s":"心理压力对生理健康有显著影响。需要持续决策和承担责任的猴子出现了严重的胃溃疡。","cat":"经典实验"},{"id":53,"t":"青蛙实验 (温水煮青蛙)","s":"渐进式的变化令人丧失警觉。突然的变化会引起剧烈反应，但缓慢的变化往往被忽视。","cat":"经典实验"},{"id":54,"t":"蔡格尼克效应实验","s":"未完成任务的记忆比已完成任务深刻约2倍。大脑对'未竟之事'有天然的记忆优势。","cat":"经典实验"},{"id":55,"t":"认知心理学","s":"研究人类的认知过程，包括注意、记忆、语言、思维、问题解决和决策等高级心理功能。","cat":"心理学分支"},{"id":56,"t":"社会心理学","s":"研究人们如何受到他人实际、想象或隐含的存在的影响。关注态度、从众、群体行为、偏见等主题。","cat":"心理学分支"},{"id":57,"t":"行为经济学","s":"将心理学洞察融入经济学分析，研究人类在有限理性下的决策行为。","cat":"心理学分支"},{"id":58,"t":"发展心理学","s":"研究人类从出生到老年的心理发展规律，涵盖认知、情感和社会性发展。皮亚杰的认知发展阶段理论是该领域的基石。","cat":"心理学分支"},{"id":59,"t":"临床心理学","s":"关注心理健康问题的评估、诊断和治疗。认知行为疗法（CBT）是循证治疗的主流方法。","cat":"心理学分支"},{"id":60,"t":"人格心理学","s":"研究人格特质、类型、成因及对行为的影响。大五人格模型（OCEAN）是目前最被接受的人格理论框架。","cat":"心理学分支"},{"id":61,"t":"丹尼尔·卡尼曼 (Daniel Kahneman)","s":"2002年诺贝尔经济学奖得主，前景理论创始人，认知偏差研究的奠基人。《思考，快与慢》作者。","cat":"心理学家"},{"id":62,"t":"理查德·塞勒 (Richard Thaler)","s":"2017年诺贝尔经济学奖得主，心理账户和助推理论的创始人，行为经济学的主要推动者。","cat":"心理学家"},{"id":63,"t":"阿莫斯·特沃斯基 (Amos Tversky)","s":"与卡尼曼共同创立前景理论，系统研究启发式与偏差。被认为是行为经济学最重要的奠基人之一。","cat":"心理学家"},{"id":64,"t":"罗伯特·西奥迪尼 (Robert Cialdini)","s":"影响力研究权威，《影响力》作者。提出六大影响力原则：互惠、承诺一致、社会认同、喜好、权威、稀缺。","cat":"心理学家"},{"id":65,"t":"丹·艾瑞里 (Dan Ariely)","s":"《怪诞行为学》作者，研究可预测的非理性行为。擅长用有趣的实验揭示日常决策中的偏差。","cat":"心理学家"},{"id":66,"t":"阿尔伯特·班杜拉 (Albert Bandura)","s":"社会学习理论创始人，自我效能感概念的提出者。波波玩偶实验证明观察学习的力量。","cat":"心理学家"},{"id":67,"t":"情绪智力 (Emotional Intelligence)","s":"识别、理解、管理和运用情绪的能力，比IQ更能预测人生成功与幸福。","cat":"情绪心理学"},{"id":68,"t":"认知失调 (Cognitive Dissonance)","s":"当行为与信念不一致时产生的心理不适，人们会改变态度来消除这种不适。","cat":"社会心理学"},{"id":69,"t":"大五人格 (Big Five Personality)","s":"用五个维度描述人格特质的模型（OCEAN），是人格心理学最可靠的框架。","cat":"人格心理学"},{"id":70,"t":"依恋理论 (Attachment Theory)","s":"婴儿与照护者之间的早期情感纽带，深刻影响一生的人际关系模式。","cat":"发展心理学"},{"id":71,"t":"自我效能感 (Self-Efficacy)","s":"个体对自己能否成功完成某项任务的信念，直接影响行为选择和坚持程度。","cat":"社会心理学"},{"id":72,"t":"心流 (Flow)","s":"全神贯注投入某项活动时的最佳体验状态，时间感消失，行动与意识合一。","cat":"积极心理学"},{"id":73,"t":"心理防御机制 (Defense Mechanisms)","s":"自我为减轻焦虑和冲突而无意识使用的心理策略，从成熟的升华到原始的否认。","cat":"精神分析"},{"id":74,"t":"刻板印象 (Stereotypes)","s":"对某一群体固定化、概括化的信念，简化认知但常导致偏见和歧视。","cat":"社会心理学"},{"id":75,"t":"群体极化 (Group Polarization)","s":"群体讨论后，成员的观点会朝原有倾向的极端方向偏移，使集体决策更激进。","cat":"社会心理学"},{"id":76,"t":"群体思维 (Groupthink)","s":"高凝聚力群体为追求一致而压制异议，导致决策质量下降的现象。","cat":"社会心理学"},{"id":77,"t":"艾宾浩斯遗忘曲线 (Ebbinghaus Forgetting Curve)","s":"记忆随时间推移而衰退的规律：学习后遗忘立即开始，初期最快，之后渐缓。","cat":"认知心理学"},{"id":78,"t":"经典条件反射 (Classical Conditioning)","s":"中性刺激与无条件刺激反复配对后，中性刺激单独也能引发条件反应。","cat":"行为主义"},{"id":79,"t":"操作性条件反射 (Operant Conditioning)","s":"通过强化和惩罚来塑造行为：被强化的行为会增加，被惩罚的行为会减少。","cat":"行为主义"},{"id":80,"t":"社会交换理论 (Social Exchange Theory)","s":"人际关系基于成本-收益的理性计算：人们追求回报最大、成本最小的关系。","cat":"社会心理学"},{"id":81,"t":"自我决定理论 (Self-Determination Theory)","s":"人类有三种基本心理需要：自主、胜任、归属，满足它们才能实现最佳发展和幸福。","cat":"动机心理学"},{"id":82,"t":"心理韧性 (Resilience)","s":"面对逆境、创伤和压力时能够反弹和适应的能力，是可培养的心理「肌肉」。","cat":"积极心理学"},{"id":83,"t":"成长型思维 (Growth Mindset)","s":"相信能力可以通过努力发展，而非固定不变。这种信念使人更愿意面对挑战、更坚韧。","cat":"教育心理学"},{"id":84,"t":"煤气灯效应 (Gaslighting)","s":"通过持续否认、扭曲事实使受害者怀疑自己的感知和判断，是一种心理操纵。","cat":"社会心理学"},{"id":85,"t":"情绪感染 (Emotional Contagion)","s":"人们会无意识地「捕捉」他人的情绪，情绪像病毒一样在人际间传播。","cat":"情绪心理学"},{"id":86,"t":"去个性化 (Deindividuation)","s":"在群体中个体失去自我意识和个人责任感，做出平时不会做的行为。","cat":"社会心理学"},{"id":87,"t":"自我实现 (Self-Actualization)","s":"充分发挥个人潜能、成为自己所能成为的「最好的自己」的最高心理需要。","cat":"人本主义心理学"},{"id":88,"t":"正念 (Mindfulness)","s":"有意识地将注意力集中在当下、不加评判地觉察此时此刻的体验。","cat":"积极心理学"},{"id":89,"t":"间隔重复 (Spaced Repetition)","s":"将复习间隔逐渐拉长，在即将遗忘时进行复习，以最少时间实现最强记忆。","cat":"认知心理学"},{"id":90,"t":"测试效应 (Testing Effect)","s":"主动回忆比反复重读更能巩固记忆，测试不仅是评估手段，更是强大的学习工具。","cat":"认知心理学"},{"id":91,"t":"情感预测偏差 (Affective Forecasting)","s":"人们预测自己未来的情绪时常出错——高估事件对情绪的影响强度和持续时间。","cat":"认知心理学"},{"id":92,"t":"自我监控 (Self-Monitoring)","s":"个体在社交中观察和控制自我呈现的程度，高自我监控者随情境调整行为。","cat":"人格心理学"},{"id":93,"t":"内外控倾向 (Locus of Control)","s":"个体认为结果由自己控制（内控）还是外部力量决定（外控）的信念差异。","cat":"人格心理学"},{"id":94,"t":"创伤后成长 (Post-Traumatic Growth)","s":"经历重大创伤后，部分人不仅恢复，还在多个领域获得超越创伤前的积极心理变化。","cat":"积极心理学"},{"id":95,"t":"旁观者干预模型 (Bystander Intervention Model)","s":"解释为什么在场人数越多，个体越不可能提供帮助的五步决策模型。","cat":"社会心理学"},{"id":96,"t":"认知评价理论 (Cognitive Appraisal Theory)","s":"情绪产生于对事件的认知评价：同一事件被评价为威胁则焦虑，被评价为挑战则兴奋。","cat":"情绪心理学"}]
function pickDailyCard() {
  const c = pick(DAILY_CARDS)
  return { type: 'auto', category: 'general', image: null, title: c.t, content: c.s, username: '每日一卡', user_type: 'system', source_api: 'daily-card', is_auto_push: true }
}

// 内置兜底模板池（LLM 失败时保底，避免当天空白）
const KINDNESS_POOL = [
  { title: '地铁上有人让座', content: '一位阿姨主动把座位让给提重物的小伙子，两人都笑了。原来温柔这么简单。' },
  { title: '便利店的小纸条', content: '店员在收银台贴了张便签：「今天也要好好吃饭呀」。被这句话暖到了。' },
  { title: '雨中共享的伞', content: '没带伞的我，被陌生邻居一路送到地铁口。她说「顺路」，其实绕了远。' },
  { title: '深夜的灯', content: '加完班回家，家里留了一盏玄关的灯。有人等你，本身就是一种善意。' },
  { title: '递过来的一杯水', content: '排队时前面的人回头问我要不要喝水，把自己多买的那瓶递了过来。' },
  { title: '扶起倒下的单车', content: '路过看到一排被风吹倒的共享单车，有人默默一辆辆扶起来。世界好温柔。' },
  { title: '一句「辛苦了」', content: '外卖小哥送餐时说「辛苦了」，我愣了一下，然后也回了句辛苦了。' },
  { title: '借出的充电器', content: '在咖啡馆手机没电，邻座陌生人把充电器推了过来：「先用我的」。' },
]
const HEALING_POOL = [
  { title: '楼下小猫蹭了我一下', content: '下班回家路上，楼下那只橘猫突然走过来蹭了蹭我的裤脚。那一刻突然觉得，被需要和被喜欢，有时候不需要理由。', category: '暖心' },
  { title: '终于把房间收拾好了', content: '拖了三周的事，今天做完了。坐在干净的地板上晒太阳，感觉自己也跟着清爽了起来。原来「做到」本身就会给人力气。', category: '成长' },
  { title: '奶茶店多给的半杯', content: '店员做漏了一杯，直接送给了我。捧着那杯意外之喜走在路上，觉得今天的运气也没那么差嘛。', category: '小确幸' },
  { title: '朋友记得我不吃香菜', content: '一起吃饭她自然地跟老板说「这碗不要香菜」。被认真记住的感觉，比奶茶还暖。', category: '暖心' },
  { title: '第一次跑完了三公里', content: '没有停下来的那种成就感，是躺在沙发上刷手机永远换不来的。今天的我比昨天多了一点点厉害。', category: '成长' },
  { title: '雨停时的天空', content: '加班出来正好雨停，云缝里漏下来的光打在湿漉漉的马路上。站了一会儿，什么烦恼都变小了。', category: '小确幸' },
]
const QUOTE_POOL = [
  '你不必时刻坚强。允许自己偶尔像猫一样，懒洋洋地、只是存在着，也很好。',
  '难过不是故障，是心在提醒你：有些东西，你很在意。',
  '把今天过成一杯温水就好——不烫嘴，也不凉心。',
  '你已经做得够多了。剩下的，交给今晚的睡眠。',
  '慢一点没关系的。花不会因为开得晚，就少一点香气。',
]

async function alreadyPushedToday(table, extraFilter) {
  const start = todayStartBeijingISO()
  const rows = await sbSelect(table, { select: 'id', created_at: `gte.${start}`, limit: '1', ...extraFilter })
  return rows.length > 0
}

async function runDailyPush(force = false) {
  if (!force) {
    // 幂等 1：community_posts 今日已有自动推送 → 跳过晴天部分
    // 幂等 2：user_cards 今日已有小木内容 → 跳过用户贡献部分
    const [sunnyDone, cardsDone] = await Promise.all([
      alreadyPushedToday('community_posts', { is_auto_push: 'eq.true' }).catch(() => false),
      alreadyPushedToday('user_cards', { author_type: 'eq.system' }).catch(() => false),
    ])
    if (sunnyDone && cardsDone) return { ok: true, skipped: true, reason: '今天已经推送过啦 ☀️' }
    return executePush(!sunnyDone, !cardsDone)
  }
  return executePush(true, true)
}

async function executePush(doSunny, doCards) {
  const content = await generateDailyContent()
  const result = { sunny: 0, xiaomuCards: 0, source: content.source }

  // —— 心灵晴天：图源 3 + 小木友善 3 + 语录 1 + 每日一卡 1 ——
  if (doSunny) {
    const [dogUrl, catUrl] = await Promise.all([fetchDogImage(), Promise.resolve(fetchCatImage())])
    const natureUrl = fetchNatureImage(rand(99999))
    const posts = []
    if (dogUrl) posts.push({ type: 'auto', category: 'general', image: dogUrl, title: '摇尾巴的伙伴', content: '它摇着尾巴跑过来，纯粹地、毫无保留地，把开心给了你。', username: '系统推送', user_type: 'system', source_api: 'dog.ceo', is_auto_push: true })
    if (catUrl) posts.push({ type: 'auto', category: 'general', image: catUrl, title: '今天遇到的猫', content: '它慢悠悠地瞥了你一眼，好像在说：别急，日子还长。', username: '系统推送', user_type: 'system', source_api: 'cataas', is_auto_push: true })
    if (natureUrl) posts.push({ type: 'auto', category: 'general', image: natureUrl, title: '雨后的天空', content: '抬头看了一会儿，整颗心好像也被风吹软了。', username: '系统推送', user_type: 'system', source_api: 'picsum', is_auto_push: true })
    // 小木名义的 3 条友善内容（需求 5：每天自动 3 条、以小木名义）
    for (const k of content.kindness) {
      posts.push({ type: 'xiaomu', category: 'kindness', image: null, title: k.title, content: k.content, username: '小木', user_type: 'system', source_api: `sunny-v2-${content.source}`, is_auto_push: true })
    }
    posts.push({ type: 'xiaomu', category: 'quote', image: null, title: '小木的今日语录', content: content.quote, username: '小木', user_type: 'system', source_api: `sunny-v2-${content.source}`, is_auto_push: true })
    posts.push(pickDailyCard())
    await sbInsert('community_posts', posts, 'return=minimal')
    result.sunny = posts.length
  }

  // —— 用户贡献区：小木名义 3 条治愈瞬间（直接 approved，author_type=system 供区分） ——
  if (doCards) {
    const rows = content.healing.map((h) => ({
      title: h.title,
      content: h.content,
      category: h.category,
      summary: h.content.slice(0, 60),
      author_id: null,
      author_name: '小木',
      author_type: 'system',
      image: null,
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewer: 'xiaomu-auto',
    }))
    if (rows.length) {
      await sbInsert('user_cards', rows, 'return=minimal')
      result.xiaomuCards = rows.length
    }
  }
  return { ok: true, pushed: true, ...result }
}

// ==================== 主入口 ====================
Deno.serve(async (req) => {
  // 浏览器跨域预检：旧版用 status:204 + 空 body 会被新版 Deno edge runtime 拒为
  // EDGE_FUNCTION_ERROR（HTTP/2 下空 204 与 Content-Length 处理有歧义），改 status:200
  // + 简单 ok 文本最稳。
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (req.method !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

  let body = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: '请求体无效' }, 400)
  }

  const action = (body.action || '').toString()

  try {
    switch (action) {
      // ---------- 帖子 ----------
      case 'post.list':
        return json({ posts: memoryEnabled ? await sbSelect('community_posts', { select: '*', order: 'created_at.desc', limit: '200' }) : [] })
      case 'post.get': {
        if (!memoryEnabled) return json({ post: null })
        const rows = await sbSelect('community_posts', { select: '*', id: `eq.${body.id}`, limit: '1' })
        return json({ post: rows[0] || null })
      }
      case 'post.add':
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' })
        return json(await addPost(body))
      case 'post.comments':
        return json({ comments: memoryEnabled ? await listComments(body.postId) : [] })
      case 'post.comment':
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' })
        return json(await addComment(body))
      case 'post.likes':
        return json({ likes: memoryEnabled ? await sbSelect('post_likes', { select: 'user_identifier', post_id: `eq.${body.postId}` }) : [] })
      case 'post.likesBatch':
        return json({ map: memoryEnabled ? await likesBatch(body.ids) : {} })
      case 'post.myLikes':
        return json({ liked: memoryEnabled ? await myLikes(body.ids, body.user_identifier) : [] })
      case 'post.toggleLike':
        if (!memoryEnabled) return json({ error: '未启用存储' })
        return json(await toggleLike(body))

      // ---------- 心情日记 ----------
      case 'mood.add':
        if (!memoryEnabled) return json({ ok: false, reason: '未启用记忆存储' })
        return json(await addMood(body))
      case 'mood.list':
        return json(memoryEnabled ? await listMood(body) : { entries: [] })

      // ---------- 治愈瞬间投稿 ----------
      case 'card.submit':
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' })
        return json(await submitCard(body))
      case 'card.approved':
        return json({ cards: memoryEnabled ? await listCards({ status: 'eq.approved', order: 'featured.desc,created_at.desc', limit: String(body.limit || 100) }) : [] })
      case 'card.mine':
        return json({ cards: memoryEnabled && body.author_id ? await listCards({ author_id: `eq.${body.author_id}` }) : [] })
      case 'card.get': {
        if (!memoryEnabled) return json({ card: null })
        const rows = await sbSelect('user_cards', { select: '*', id: `eq.${body.id}`, limit: '1' })
        return json({ card: shapeCard(rows[0] || null) })
      }
      case 'card.pending':
      case 'card.list': {
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        if (!memoryEnabled) return json({ cards: [] })
        const status = action === 'card.pending' ? 'pending' : (body.status || 'pending')
        return json({ cards: await listCards({ status: `eq.${status}` }) })
      }
      case 'card.approve':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        return json(await reviewCard(body, 'approved'))
      case 'card.reject':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        return json(await reviewCard(body, 'rejected'))
      case 'card.feature':
      case 'card.unfeature':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        await sbPatch('user_cards', { id: `eq.${body.id}` }, { featured: action === 'card.feature' })
        return json({ ok: true })
      case 'card.hugBatch': {
        if (!memoryEnabled || !body.ids?.length) return json({ map: {} })
        const rows = await sbSelect('card_hugs', { select: 'card_id', card_id: `in.(${body.ids.join(',')})` })
        const map = {}
        for (const r of rows) if (r.card_id) map[r.card_id] = (map[r.card_id] || 0) + 1
        return json({ map })
      }
      case 'card.hugMine': {
        if (!memoryEnabled || !body.ids?.length || !body.user_identifier) return json({ liked: [] })
        const rows = await sbSelect('card_hugs', { select: 'card_id', card_id: `in.(${body.ids.join(',')})`, user_identifier: `eq.${body.user_identifier}` })
        return json({ liked: rows.map((r) => r.card_id) })
      }
      case 'card.hugToggle':
        if (!memoryEnabled) return json({ error: '未启用存储' })
        return json(await toggleHug(body))

      // ---------- 举报 ----------
      case 'report.submit':
        if (!memoryEnabled) return json({ error: '未启用存储' })
        return json(await submitReport(body))
      case 'report.list':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        return json({ reports: memoryEnabled ? await sbSelect('reports', { select: '*', status: 'eq.open', order: 'created_at.desc' }) : [] })
      case 'report.resolve':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        await sbPatch('reports', { id: `eq.${body.id}` }, { status: 'resolved', resolved_at: new Date().toISOString() })
        return json({ ok: true })

      // ---------- 反馈建议（0012 新增） ----------
      case 'feedback.submit':
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' })
        return json(await submitFeedback(body))
      case 'feedback.list':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        return json({
          feedback: memoryEnabled
            ? await sbSelect('feedback', { select: '*', order: 'created_at.desc', status: body.status ? `eq.${body.status}` : undefined })
            : [],
        })
      case 'feedback.resolve':
        if (!(await isAdmin(body.adminPwd))) return json({ error: '无管理员权限' }, 403)
        await sbPatch('feedback', { id: `eq.${body.id}` }, { status: 'done', resolved_at: new Date().toISOString() })
        return json({ ok: true })

      // ---------- 每日推送（0012：LLM 生成 + 小木名义 + 双幂等） ----------
      case 'sunny.push':
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' })
        if (!LLM_API_KEY) return json({ ok: false, error: '未配置大模型 key' })
        return json(await runDailyPush(!!body.force))

      // ---------- 身份与会话（批次 M） ----------
      case 'auth.issueToken':
        return json(await issueToken(body))
      case 'auth.verify':
        return json(await verifySession(body))
      case 'auth.migrate':
        return json(await migrateIdentity(body))

      // ---------- 彻底删除账号（批次 P） ----------
      case 'account.purge':
        return json(await purgeAccount(body))

      // ---------- 小木跨设备同步（批次 N） ----------
      case 'state.get':
        return json(await stateGet(body))
      case 'state.put':
        return json(await statePut(body))
      case 'state.putSkin':
        return json(await statePutSkin(body))
      case 'state.clearSkin':
        return json(await stateClearSkin(body))

      // ---------- 自定义模型（M5） ----------
      // 统一前置 requireConfirmed：D6 仅确权账号 + D11 白名单兜底 + 加密功能就绪检查。
      // 模型选择的真源在服务端表 xiaomu_model_config —— 前端**无法**在请求体里指定模型。
      case 'model.presets':
        return json({ ok: true, presets: MODEL_PRESETS })
      case 'model.get':
        return json(await modelGet(body))
      case 'model.set':
        return json(await modelSet(body))
      case 'model.toggle':
        return json(await modelToggle(body))
      case 'model.clear':
        return json(await modelClear(body))
      case 'model.test':
        return json(await modelTest(body))

      default:
        return json({ error: '无效的操作类型：' + action }, 400)
    }
  } catch (e) {
    console.error(`content ${action} 出错：`, e.message)
    // e.status / e.reason 由业务显式抛出（如 403 越权、409 版本冲突、413 超限）；
    // 未标注的一律按 500 处理
    const out = { error: e.message || '操作失败' }
    if (e.reason) out.reason = e.reason
    return json(out, e.status || 500)
  }
})
