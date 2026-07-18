-- 用户「治愈瞬间」投稿表（含审核）
-- 执行位置：Supabase SQL Editor（已通过 MCP apply_migration 应用）
--
-- 隐私模型：与 companion / mood 一致 —— 全部经 Netlify Function（service_role）中转，
-- 前端不直连 Supabase。本表 RLS 启用但【不设任何 policy】，因此 anon / authenticated
-- 均无法直接读写，仅 service_role（/.netlify/functions/user-cards）可访问，
-- 彻底杜绝「待审内容被直连读取」的泄漏。

CREATE TABLE IF NOT EXISTS user_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  summary TEXT,
  source TEXT,                      -- 来源/出处
  author_id TEXT,                   -- 作者标识（游客 id 或 GitHub 用户名）
  author_name TEXT,                -- 作者昵称
  author_type TEXT DEFAULT 'guest',-- 'guest' 或 'github'
  image TEXT,                       -- 可选配图 URL（治愈瞬间）
  status TEXT DEFAULT 'pending',   -- pending | approved | rejected
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewer TEXT
);

ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;

-- 注意：此处刻意不创建任何 policy。
-- 旧版曾放开 INSERT/SELECT，会导致待审卡片可被任何人直连读取，已移除。
-- 所有读写统一走 netlify/functions/user-cards.js（service_role 绕过 RLS）。

CREATE INDEX IF NOT EXISTS idx_user_cards_status ON user_cards(status);
CREATE INDEX IF NOT EXISTS idx_user_cards_category ON user_cards(category);
CREATE INDEX IF NOT EXISTS idx_user_cards_created ON user_cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_cards_author ON user_cards(author_id);
