// 社区交流前端 API —— 全部经 Netlify Function 中转（/.netlify/functions/community）
// 不再直连 Supabase，不再暴露 publishable key；统一的错误/危机检测在服务端完成。

const ENDPOINT = '/.netlify/functions/community'

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

export const communityApi = {
  // 帖子列表（时间倒序，公开）
  async getPosts() {
    const data = await call('list')
    return data.posts || []
  },

  // 发帖（向后兼容两种调用）
  // 旧：addPost(title, content, user)
  // 新：addPost({ title, content, user, type, category, image })
  // 返回：帖子行对象，并附带 crisis 标志（命中高危词时为 true）
  async addPost(titleOrPayload, content, user) {
    let payload
    if (typeof titleOrPayload === 'object' && titleOrPayload !== null) {
      payload = titleOrPayload
    } else {
      payload = { title: titleOrPayload, content, user }
    }
    const data = await call('add', {
      title: payload.title,
      content: payload.content,
      user: payload.user || {},
      type: payload.type,
      category: payload.category,
      image: payload.image,
    })
    // 透传 crisis 标志，同时保留帖子行结构供调用方使用
    return Object.assign({}, data.post || {}, { crisis: !!data.crisis })
  },

  // 获取单个帖子
  async getPost(id) {
    const data = await call('get', { id })
    return data.post || null
  },

  // 获取帖子评论
  async getComments(postId) {
    const data = await call('comments', { postId })
    return data.comments || []
  },

  // 发表评论（返回新建的评论行）
  async addComment(postId, content, user) {
    const data = await call('comment', { postId, content, user: user || {} })
    return data.comment || null
  },

  // 获取单帖认同列表（[{ user_identifier }]）
  async getLikes(postId) {
    const data = await call('likes', { postId })
    return data.likes || []
  },

  // 批量认同数：传入 post id 数组，返回 { [postId]: count }
  async getLikesBatch(ids) {
    const data = await call('likesBatch', { ids: ids || [] })
    return data.map || {}
  },

  // 当前用户在给定帖子里的已认同集合：返回 [post_id,...]
  async myLikes(ids, userIdentifier) {
    const data = await call('myLikes', { ids: ids || [], user_identifier: userIdentifier })
    return data.liked || []
  },

  // 切换认同状态（user 含 type/username/id）
  async toggleLike(postId, user) {
    const identifier = user.type === 'github' ? user.username : user.id
    return call('toggleLike', {
      postId,
      user_identifier: identifier,
      user_type: user.type || (user.token ? 'github' : 'guest'),
    })
  },

  // 懒触发：前端「每日首次打开」时若今日无自动推送，调用 Netlify Function 即时拉取
  // 返回 { ok, pushed, skipped, count } 或抛出错误
  async triggerSunnyPush(force = false) {
    const res = await fetch('/.netlify/functions/sunny-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(force ? { force: true } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '触发推送失败')
    return data
  },
}
