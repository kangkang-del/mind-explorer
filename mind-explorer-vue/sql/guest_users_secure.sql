-- 收紧 guest_users 的 RLS：游客认证已改为 Netlify Function + service_role 中转，
-- 旧的「任何人可读/注册/更新」开放策略不再需要，且存在 password_hash 泄露风险，
-- 应全部移除。RLS 保持启用但无 policy（仅 service_role 可访问）。
-- 执行位置：Supabase SQL Editor

DROP POLICY IF EXISTS "Anyone can register" ON guest_users;
DROP POLICY IF EXISTS "Anyone can read profiles" ON guest_users;
DROP POLICY IF EXISTS "Users can update own profile" ON guest_users;
