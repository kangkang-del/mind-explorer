/**
 * 游客账号认证 API（直连 Supabase）
 *
 * 密码在前端做 SHA-256 哈希后发送，数据库存储哈希值
 */

import { supabase } from './supabase'

// 简易 SHA-256（浏览器原生 crypto API）
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export const guestAuthApi = {
  // 注册新游客账号
  async register(username, password, displayName) {
    const pwdHash = await hashPassword(password)

    const { data, error } = await supabase
      .from('guest_users')
      .insert([{
        username: username,
        password_hash: pwdHash,
        display_name: displayName || username,
        created_at: new Date().toISOString()
      }])
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        throw new Error('该昵称已被使用，请换一个')
      }
      throw new Error('注册失败: ' + error.message)
    }

    return data
  },

  // 游客登录（校验用户名+密码）
  async login(username, password) {
    const pwdHash = await hashPassword(password)

    // 查询匹配的用户名和密码哈希
    const { data: user, error } = await supabase
      .from('guest_users')
      .select('*')
      .eq('username', username)
      .eq('password_hash', pwdHash)
      .eq('is_banned', false)
      .single()

    if (error || !user) {
      throw new Error('用户名或密码错误')
    }

    // 更新最后登录时间
    await supabase
      .from('guest_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)

    return user
  },

  // 获取游客公开信息（用于个人主页等）
  async getUserInfo(userId) {
    const { data, error } = await supabase
      .from('guest_users')
      .select('id, username, avatar, display_name, bio, is_banned, created_at')
      .eq('id', userId)
      .single()

    if (error) throw error
    return data
  },

  // 检查用户名是否可用（注册时实时校验）
  async checkUsernameAvailable(username) {
    const { count, error } = await supabase
      .from('guest_users')
      .select('*', { count: 'exact', head: true })
      .eq('username', username)

    if (error) return false
    return count === 0
  }
}
