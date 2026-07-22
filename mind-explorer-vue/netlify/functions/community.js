// Netlify Function: 社区交流（帖子 / 评论 / 认同）后端中转
//
// 收口说明：原前端 src/api/community.js 直连 Supabase（暴露 publishable key，且无法统一
// 错误/危机检测）。现全部经本函数 service_role 中转，与 user-cards / favorites 同模式：
//   - 前端不直连 Supabase，不再需要 publishable key
//   - 表 RLS 启用但不设 policy，仅 service_role 可访问
//   - 统一错误结构与危机检测（命中高危词返回 crisis 标志，非阻断）
//
// 同时替代旧的 GitHub Issues 版 community.js（已无调用方，彻底移除双轨隐患）。
//
// 前端 POST 调用，请求体统一带 action：
//   { action: 'list' }                                  帖子列表（时间倒序，公开）
//   { action: 'get',       id }                          单帖详情
//   { action: 'add',       title, content, user, type?, category?, image? }
//   { action: 'comments',  postId }                      某帖评论（时间正序）
//   { action: 'comment',   postId, content, user }       发表评论
//   { action: 'likes',     postId }                      某帖认同用户标识列表
//   { action: 'likesBatch',ids:[] }                      批量认同数 {postId:count}
//   { action: 'myLikes',   ids:[], user_identifier }     当前用户已认同的帖 id 列表
//   { action: 'toggleLike',postId, user_identifier, user_type? }  切换认同，返回 {liked}
//
// 环境变量（Netlify，不写仓库）：
//   SUPABASE_URL                 项目地址（缺省兜底）
//   SUPABASE_SERVICE_ROLE_KEY    服务端密钥（绕过 RLS 读写社区表）

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const memoryEnabled = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)

// 全站危机干预统一中间件
import { detectCrisis } from './_lib/crisis.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body, status = 200) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

// 从前端传入的 user 对象解析发帖人信息（兼容旧 {name,username,type,id,avatar} 结构）
function resolveAuthor(user = {}) {
  return {
    username: user.name || user.username || '匿名用户',
    user_type: user.type || (user.token ? 'github' : 'guest'),
    avatar: user.avatar || null,
  }
}

// ---------- 帖子（community_posts） ----------

async function listPosts() {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: '200',
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`读取帖子失败 ${res.status}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

async function getPost(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/community_posts?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

async function addPost(body) {
  const title = (body.title || '').toString().trim()
  const content = (body.content || '').toString().trim()
  if (!title || !content) throw new Error('标题和内容都不能为空')
  if (title.length > 100) throw new Error('标题请控制在 100 字以内')
  if (content.length > 5000) throw new Error('内容请控制在 5000 字以内')

  const a = resolveAuthor(body.user || {})
  const row = {
    title,
    content,
    username: a.username,
    user_type: a.user_type,
    avatar: a.avatar,
    type: (body.type || 'user').toString().trim() || 'user',
    category: (body.category || 'general').toString().trim() || 'general',
    image: (body.image || '').toString().trim() || null,
    is_auto_push: false,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/community_posts`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`发布失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  const rows = await res.json()
  const created = Array.isArray(rows) ? rows[0] : null
  // 非阻断危机检测：命中即返回 crisis 标志，由前端弹援助资源
  const crisis = detectCrisis(`${title} ${content}`)
  return { ok: true, post: created, crisis }
}

// ---------- 评论（post_comments） ----------

async function listComments(postId) {
  const params = new URLSearchParams({
    select: '*',
    post_id: `eq.${postId}`,
    order: 'created_at.asc',
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_comments?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`读取评论失败 ${res.status}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

async function addComment(body) {
  const content = (body.content || '').toString().trim()
  if (!content) throw new Error('评论内容不能为空')
  const a = resolveAuthor(body.user || {})
  const row = {
    post_id: body.postId,
    content,
    username: a.username,
    user_type: a.user_type,
    avatar: a.avatar,
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_comments`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`评论失败 ${res.status}: ${txt.slice(0, 200)}`)
  }
  const rows = await res.json()
  return { ok: true, comment: Array.isArray(rows) ? rows[0] : null }
}

// ---------- 认同（post_likes） ----------

async function listLikes(postId) {
  const params = new URLSearchParams({
    select: 'user_identifier',
    post_id: `eq.${postId}`,
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_likes?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`读取认同失败 ${res.status}`)
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

async function likesBatch(ids) {
  if (!ids || !ids.length) return {}
  const params = new URLSearchParams({
    select: 'post_id',
    post_id: `in.(${ids.join(',')})`,
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_likes?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`读取认同失败 ${res.status}`)
  const rows = await res.json()
  const map = {}
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.post_id) map[r.post_id] = (map[r.post_id] || 0) + 1
  }
  return map
}

async function myLikes(ids, userIdentifier) {
  if (!ids || !ids.length || !userIdentifier) return []
  const params = new URLSearchParams({
    select: 'post_id',
    post_id: `in.(${ids.join(',')})`,
    user_identifier: `eq.${userIdentifier}`,
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_likes?${params}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`读取认同失败 ${res.status}`)
  const rows = await res.json()
  return (Array.isArray(rows) ? rows : []).map((r) => r.post_id)
}

async function toggleLike(body) {
  const { postId, user_identifier: identifier, user_type: userType } = body
  if (!postId || !identifier) throw new Error('缺少帖子或用户标识')

  // 查是否已认同
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/post_likes?select=id&post_id=eq.${encodeURIComponent(postId)}&user_identifier=eq.${encodeURIComponent(identifier)}&limit=1`,
    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
  )
  if (!checkRes.ok) throw new Error(`查询认同失败 ${checkRes.status}`)
  const existing = await checkRes.json()
  const has = Array.isArray(existing) && existing.length > 0

  if (has) {
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/post_likes?post_id=eq.${encodeURIComponent(postId)}&user_identifier=eq.${encodeURIComponent(identifier)}`,
      { method: 'DELETE', headers: sbHeaders(), signal: AbortSignal.timeout(8000) }
    )
    if (!delRes.ok && delRes.status !== 204) throw new Error('取消认同失败')
    return { liked: false }
  } else {
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/post_likes`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ post_id: postId, user_identifier: identifier, user_type: userType || null }),
      signal: AbortSignal.timeout(8000),
    })
    if (!insRes.ok) throw new Error(`认同失败 ${insRes.status}`)
    return { liked: true }
  }
}

// ---------- 主入口 ----------

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json({ error: '请求体无效' }, 400)
  }

  const action = body.action

  try {
    switch (action) {
      case 'list': {
        if (!memoryEnabled) return json({ posts: [] })
        const posts = await listPosts()
        return json({ posts })
      }
      case 'get': {
        if (!memoryEnabled) return json({ post: null })
        const post = await getPost(body.id)
        return json({ post })
      }
      case 'add': {
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' }, 200)
        const r = await addPost(body)
        return json(r)
      }
      case 'comments': {
        if (!memoryEnabled) return json({ comments: [] })
        const comments = await listComments(body.postId)
        return json({ comments })
      }
      case 'comment': {
        if (!memoryEnabled) return json({ ok: false, error: '未启用存储' }, 200)
        const r = await addComment(body)
        return json(r)
      }
      case 'likes': {
        if (!memoryEnabled) return json({ likes: [] })
        const likes = await listLikes(body.postId)
        return json({ likes })
      }
      case 'likesBatch': {
        if (!memoryEnabled) return json({ map: {} })
        const map = await likesBatch(body.ids)
        return json({ map })
      }
      case 'myLikes': {
        if (!memoryEnabled) return json({ liked: [] })
        const liked = await myLikes(body.ids, body.user_identifier)
        return json({ liked })
      }
      case 'toggleLike': {
        if (!memoryEnabled) return json({ error: '未启用存储' }, 200)
        const r = await toggleLike(body)
        return json(r)
      }
      default:
        return json({ error: '无效的操作类型：' + action }, 400)
    }
  } catch (e) {
    return json({ error: e.message || '操作失败' }, 500)
  }
}
