// Netlify Function: 已永久下线（410 Gone）—— 2026-11-09 Phase 3
//
// 原功能：心灵晴天「每日自动推送」（LLM 生成 + 小木 3 条善意 + 语录 + 每日一卡 + 3 张图
//         + user_cards 小木卡片 3 条），含 DRY_RUN 调试开关。
//
// 现址：Supabase Edge Function `content` 的 `sunny.push` action，内置「当天已推送则跳过」的双幂等。
//       定时触发由 .github/workflows/sunny-push.yml 直连 content 函数完成，**不经过本文件**；
//       前端打开首页/心灵晴天时也会兜底懒触发 content。
//       两者通过幂等互斥，不会重复推送。
//
// 为什么保留空壳而不直接删：
//   取不到 Netlify 函数日志，无法排除站外调用方；返回 410（永久下线）比 404 更容易让
//   调用方判断"该停了"，也便于事后从 Netlify 的 4xx 指标里看到还有谁在打。
//   OPTIONS 返回 204，用于把「软下线（204/410）」与「已删除（404）」区分开。
//
// 🔴 本文件必须保持"零依赖、零业务调用"——handler 入口即返回，
//    不读环境变量、不连大模型、不写数据库。任何"顺手做点事"的改动都会让
//    一个已下线的端点重新具备写入能力（原实现能一次写入 8 条 Post + 3 张卡片）。

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
      message: '该接口已永久下线，每日推送请调用 Supabase Edge Function content 的 sunny.push action',
    }),
  }
}
