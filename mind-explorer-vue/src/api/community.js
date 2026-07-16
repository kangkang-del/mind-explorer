import { supabase } from './supabase'

export const communityApi = {
  // 获取帖子列表（含 type / category / image / is_auto_push 等推送字段）
  async getPosts() {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  // 发帖（向后兼容两种调用）
  // 旧：addPost(title, content, user)
  // 新：addPost({ title, content, user, type, category, image, isAutoPush })
  async addPost(titleOrPayload, content, user) {
    let payload
    if (typeof titleOrPayload === 'object' && titleOrPayload !== null) {
      payload = titleOrPayload
    } else {
      payload = { title: titleOrPayload, content, user }
    }
    const u = payload.user || {}
    const { data, error } = await supabase
      .from('community_posts')
      .insert([
        {
          title: payload.title,
          content: payload.content,
          user_type: u.type || (u.token ? 'github' : 'guest'),
          username: u.name || u.username || '匿名用户',
          avatar: u.avatar || null,
          type: payload.type || 'user',
          category: payload.category || 'general',
          image: payload.image || null,
          is_auto_push: !!payload.isAutoPush || payload.type === 'auto' || payload.type === 'xiaomu',
        },
      ])
      .select()
    if (error) throw error
    return data[0]
  },

  // 获取单个帖子
  async getPost(id) {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  // 获取帖子评论
  async getComments(postId) {
    const { data, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  // 发表评论
  async addComment(postId, content, user) {
    const { data, error } = await supabase
      .from('post_comments')
      .insert([
        {
          post_id: postId,
          content: content,
          user_type: user.type || (user.token ? 'github' : 'guest'),
          username: user.name || user.username || '匿名用户',
          avatar: user.avatar || null,
        },
      ])
      .select()
    if (error) throw error
    return data[0]
  },

  // 获取单帖认同列表
  async getLikes(postId) {
    const { data, error } = await supabase
      .from('post_likes')
      .select('user_identifier')
      .eq('post_id', postId)
    if (error) throw error
    return data || []
  },

  // 批量获取点赞数：传入 post id 数组，返回 { [postId]: count }
  async getLikesBatch(ids) {
    if (!ids || !ids.length) return {}
    const { data, error } = await supabase
      .from('post_likes')
      .select('post_id')
      .in('post_id', ids)
    if (error) throw error
    const map = {}
    for (const r of data || []) {
      map[r.post_id] = (map[r.post_id] || 0) + 1
    }
    return map
  },

  // 切换认同状态
  async toggleLike(postId, user) {
    const identifier = user.type === 'github' ? user.username : user.id
    const userType = user.type || (user.token ? 'github' : 'guest')

    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_identifier', identifier)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_identifier', identifier)
      if (error) throw error
      return { liked: false }
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert([{ post_id: postId, user_identifier: identifier, user_type: userType }])
      if (error) throw error
      return { liked: true }
    }
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
