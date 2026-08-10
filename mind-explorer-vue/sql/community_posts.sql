-- 社区帖子表（发帖 / 评论 / 认同）——补全缺失建表
-- 执行位置：Supabase SQL Editor 或经 MCP apply_migration
-- 安全模型：RLS 启用但【无任何 policy】，所有读写经 Netlify Function + service_role 中转

-- 帖子
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  username TEXT,
  user_type TEXT,
  avatar TEXT,
  type TEXT NOT NULL DEFAULT 'user',          -- user / auto / xiaomu
  category TEXT NOT NULL DEFAULT 'general',   -- cat / dog / kindness / nature / quote / general
  image TEXT,
  source_api TEXT,
  is_auto_push BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 评论
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  username TEXT,
  user_type TEXT,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 认同（点赞）
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_identifier TEXT NOT NULL,
  user_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (post_id, user_identifier)
);

-- RLS：启用但无 policy（仅 service_role 可访问）
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- 索引
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_auto_created ON community_posts (is_auto_push, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes (post_id);
