/**
 * 用户上传卡片 API（直连 Supabase）
 * 长内容提交前 gzip 压缩，读取时自动解压，避免请求体过大
 */

import { supabase } from './supabase'
import { gzipToString, gunzipFromString } from '../utils/compress'

const COMPRESS_THRESHOLD = 800  // 超过 800 字符才压缩

// 批量解压（API 层统一处理，上层无需关心）
async function decompressList(list) {
  if (!list || !list.length) return list || []
  return Promise.all(list.map(async (c) => {
    if (c.is_compressed && c.content) {
      try { c.content = await gunzipFromString(c.content) } catch (e) {}
    }
    return c
  }))
}

export const userCardsApi = {
  // 提交新卡片（长内容压缩）
  async submit(card) {
    let content = card.content
    let isCompressed = false
    if (content && content.length > COMPRESS_THRESHOLD) {
      content = await gzipToString(content)
      isCompressed = true
    }

    const { data, error } = await supabase
      .from('user_cards')
      .insert([{
        title: card.title,
        content: content,
        is_compressed: isCompressed,
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

  async getApproved(limit = 50) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return decompressList(data)
  },

  async getByAuthor(authorId) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return decompressList(data)
  },

  async getByStatus(status) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
    if (error) throw error
    return decompressList(data)
  },

  async getPending() {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return decompressList(data)
  },

  async approve(id, reviewer) {
    const { error } = await supabase
      .from('user_cards')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewer: reviewer || 'admin' })
      .eq('id', id)
    if (error) throw new Error('审核失败: ' + error.message)
  },

  async reject(id, reviewer) {
    const { error } = await supabase
      .from('user_cards')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewer: reviewer || 'admin' })
      .eq('id', id)
    if (error) throw new Error('审核失败: ' + error.message)
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    const list = await decompressList([data])
    return list[0]
  }
}
