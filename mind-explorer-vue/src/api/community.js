import { supabase } from './supabase'

export const communityApi = {
  // 获取帖子列表
  async getPosts() {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  // 发帖
  async addPost(title, content, user) {
    const { data, error } = await supabase
      .from('community_posts')
      .insert([{
        title: title,
        content: content,
        user_type: user.type || (user.token ? 'github' : 'guest'),
        username: user.name,
        avatar: user.avatar || null
      }])
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
      .insert([{
        post_id: postId,
        content: content,
        user_type: user.type || (user.token ? 'github' : 'guest'),
        username: user.name,
        avatar: user.avatar || null
      }])
      .select()
    if (error) throw error
    return data[0]
  },

  // 获取认同列表
  async getLikes(postId) {
    const { data, error } = await supabase
      .from('post_likes')
      .select('user_identifier')
      .eq('post_id', postId)
    if (error) throw error
    return data || []
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
  }
}
