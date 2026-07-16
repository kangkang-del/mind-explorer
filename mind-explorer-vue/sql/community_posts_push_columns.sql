-- ============================================================
-- 心灵晴天 · 自动推送（P3）所需字段迁移
-- 作用：为 community_posts 表补充「自动推送 / 分类 / 配图」相关列
-- 执行方式：在 Supabase 控制台 → SQL Editor 中粘贴运行一次即可
-- 说明：新增列均为可空 / 带默认值，对已有用户帖（type 默认 user）无影响
-- ============================================================

-- 帖子类型：user=用户帖 / auto=系统自动推送 / xiaomu=小木语录
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'user';

-- 内容分类：cat=猫 / dog=狗 / kindness=善意 / nature=环境 / quote=小木语录
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

-- 配图外链（用户帖可能为空）
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS image text;

-- 自动推送来源标记：dog.ceo / cataas / picsum / template / deepseek
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS source_api text;

-- 是否系统自动推送（用于「今日已推送」幂等判断 & 前端「✨ 今日晴天」标签）
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS is_auto_push boolean NOT NULL DEFAULT false;

-- 加速「今日是否推送过」的查询
CREATE INDEX IF NOT EXISTS idx_community_posts_auto_created
  ON community_posts (is_auto_push, created_at DESC);

-- 可选：若希望匿名用户也能被定时函数写入（service_role 不需要），
-- 且希望前端点赞/评论的现有策略保持不变，则无需额外 RLS 改动。
-- 如使用 anon key 运行 sunny-push 且写入报 401/403，请在 Supabase →
-- Authentication → Policies 中为 community_posts 增加一条
-- 「Allow insert for anon / authenticated」策略（或改用 service_role key）。
