-- 审核功能 + 内容压缩所需的改动（在已执行 user_cards.sql 后执行）
-- 执行位置：Supabase SQL Editor

-- 1. 新增压缩标记字段（长内容 gzip 后存储）
ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE;

-- 2. 审核操作的 RLS UPDATE 策略
-- 纯前端架构下使用 anon key，前端用管理员密码做软限制
-- 生产环境应改为仅 service_role 或特定管理员角色可更新
DROP POLICY IF EXISTS "Anyone can update card status" ON user_cards;
CREATE POLICY "Anyone can update card status" ON user_cards
  FOR UPDATE USING (true) WITH CHECK (true);

-- 验证：SELECT id, is_compressed, status FROM user_cards LIMIT 5;
