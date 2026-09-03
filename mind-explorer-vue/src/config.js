// Supabase 前端公共配置
// anon key 是 Supabase 的「publishable key」（官方设计为可公开，真正的权限控制在
// 服务端 RLS / Edge Function 里），因此写在这里随前端分发是安全的。
// 如后续更换 Supabase 项目，只需改这一个文件。

export const SUPABASE_URL = 'https://acadcmanqsldwrmysqcb.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYWRjbWFucXNsZHdybXlzcWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNjY4NTQsImV4cCI6MjEwMzY0Mjg1NH0.bd9HRJpYX0hD0sStRCTLeEvPYeq0PcV8S27tr2-JxLA'

// Edge Functions 基地址
export const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`

// 统一的 Edge Function 请求头（anon key 直连，无需再经 Netlify 中转）
export function edgeHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  }
}
