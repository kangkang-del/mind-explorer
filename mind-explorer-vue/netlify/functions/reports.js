// Netlify Function: 已永久下线（410 Gone）—— 2026-11-09 Phase 3
//
// 原功能：举报（user_card / community_post）
// 现址：Supabase Edge Function `content` 的 `report.submit` / `report.list` / `report.resolve`
//       （前端 src/api/reports.js 的 ENDPOINT 早就指向 content，本函数已无调用方）
//
// 为什么保留空壳而不直接删：
//   取不到 Netlify 函数日志，无法排除站外调用方；返回 410（永久下线）比 404 更容易让
//   调用方判断"该停了"，也便于事后从 Netlify 的 4xx 指标里看到还有谁在打。
//   OPTIONS 返回 204，用于把「软下线（204/410）」与「已删除（404）」区分开。
//
// 注意：本文件必须保持"零依赖、零业务调用"——handler 入口即返回，
//       不读环境变量、不连数据库，避免任何副作用。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }
  return {
    statusCode: 410,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'gone',
      message: '该接口已永久下线，举报功能请改用 Supabase Edge Function content 的 report.* action',
    }),
  }
}
