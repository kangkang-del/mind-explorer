-- 用户上传的知识卡片表（含审核）
-- 执行位置：Supabase SQL Editor

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
  status TEXT DEFAULT 'pending',   -- pending | approved | rejected
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewer TEXT
);

ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;

-- 任何人可提交
CREATE POLICY "Anyone can submit cards" ON user_cards FOR INSERT WITH CHECK (true);
-- 已审核通过的卡片任何人可读
CREATE POLICY "Approved cards are readable" ON user_cards FOR SELECT USING (status = 'approved');
-- 作者可读自己所有卡片（含待审）
CREATE POLICY "Authors read own" ON user_cards FOR SELECT USING (true);

CREATE INDEX idx_user_cards_status ON user_cards(status);
CREATE INDEX idx_user_cards_category ON user_cards(category);
CREATE INDEX idx_user_cards_created ON user_cards(created_at DESC);

-- 审核通过的卡片才展示在学习页
-- 管理审核接口见 netlify/functions/admin-review.js（待适配）
