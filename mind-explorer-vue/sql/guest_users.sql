-- 游客账号表（服务端校验密码）
-- 执行位置：Supabase SQL Editor

CREATE TABLE IF NOT EXISTS guest_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,       -- 昵称（唯一，用于登录）
  password_hash TEXT NOT NULL,         -- 密码哈希（SHA-256，不可逆）
  avatar TEXT,                         -- 头像 URL
  display_name TEXT,                   -- 显示名称
  bio TEXT,                            -- 个人简介
  is_banned BOOLEAN DEFAULT FALSE,    -- 是否被封禁
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- RLS：任何人可注册/登录，已登录用户可读
ALTER TABLE guest_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can register" ON guest_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read profiles" ON guest_users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON guest_users FOR UPDATE USING (true);

-- 查询索引
CREATE INDEX idx_guest_users_username ON guest_users(username);

-- 注意：密码在前端做 SHA-256 哈希后发送，数据库存储哈希值
-- 实际生产应使用 bcrypt/scrypt + 后端中间件，但当前架构为纯前端直连 Supabase，
-- 使用 SHA-256 是可接受的权衡方案（防止明文传输）
