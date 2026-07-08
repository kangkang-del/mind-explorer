import axios from 'axios'
import { supabase } from './supabase'

const API_BASE = '/.netlify/functions'

export const cardApi = {
  // === Supabase 点赞系统（游客和 GitHub 用户通用）===

  // 获取点赞列表
  async getLikes(cardId) {
    const { data, error } = await supabase
      .from('guest_likes')
      .select('user_identifier')
      .eq('card_id', parseInt(cardId))
    if (error) throw error
    return data || []
  },

  // 切换点赞状态（点赞/取消点赞）
  async toggleLike(cardId, user) {
    const identifier = user.type === 'github' ? user.username : user.id
    const userType = user.type || (user.token ? 'github' : 'guest')

    // 检查是否已点赞
    const { data: existing } = await supabase
      .from('guest_likes')
      .select('id')
      .eq('card_id', parseInt(cardId))
      .eq('user_identifier', identifier)
      .single()

    if (existing) {
      // 已点赞 → 取消
      const { error } = await supabase
        .from('guest_likes')
        .delete()
        .eq('card_id', parseInt(cardId))
        .eq('user_identifier', identifier)
      if (error) throw error
      return { liked: false }
    } else {
      // 未点赞 → 添加
      const { error } = await supabase
        .from('guest_likes')
        .insert([{
          card_id: parseInt(cardId),
          user_identifier: identifier,
          user_type: userType
        }])
      if (error) throw error
      return { liked: true }
    }
  },

  // === 评论系统 ===

  async getComments(cardId) {
    const { data, error } = await supabase
      .from('guest_comments')
      .select('*')
      .eq('card_id', parseInt(cardId))
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async addComment(cardId, content, user) {
    const { data, error } = await supabase
      .from('guest_comments')
      .insert([{
        card_id: parseInt(cardId),
        content: content,
        user_type: user.type || (user.token ? 'github' : 'guest'),
        username: user.name,
        avatar: user.avatar || null
      }])
      .select()
    if (error) throw error
    return data
  }
}
