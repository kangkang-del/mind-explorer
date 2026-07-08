/**
 * 用户上传卡片 API（直连 Supabase）
 */

import { supabase } from './supabase'

export const userCardsApi = {
  // 提交新卡片（待审核）
  async submit(card) {
    const { data, error } = await supabase
      .from('user_cards')
      .insert([{
        title: card.title,
        content: card.content,
        category: card.category || null,
        summary: card.summary || null,
        source: card.source || null,
        author_id: card.author_id,
        author_name: card.author_name,
        author_type: card.author_type || 'guest',
        status: 'pending'
      }])
      .select()
      .maybeSingle()

    if (error) throw new Error('提交失败: ' + error.message)
    return data
  },

  // 获取已审核通过的卡片
  async getApproved(limit = 50) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  },

  // 获取作者自己的卡片（含待审）
  async getByAuthor(authorId) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }
}
