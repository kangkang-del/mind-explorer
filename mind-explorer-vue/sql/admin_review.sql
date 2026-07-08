-- 审核功能所需的 RLS 策略（在已执行 user_cards.sql 后执行）
-- 执行位置：Supabase SQL Editor

-- 允许审核操作（更新 status 字段）
-- 注意：纯前端架构下使用 anon key，前端用管理员密码做软限制
-- 生产环境应改为仅 service_role 或特定管理员角色可更新
CREATE POLICY "Anyone can update card status" ON user_cards
  FOR UPDATE USING (true) WITH CHECK (true);

-- 可选：创建管理员视图（列出待审核卡片）
-- 实际审核在 Admin.vue 中用 status='pending' 过滤实现，无需视图

-- 验证策略是否生效：
-- SELECT * FROM user_cards WHERE status = 'pending';
