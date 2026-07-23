-- 内容与社区收尾：治愈瞬间策展 + 抱抱 + 举报
-- 执行位置：Supabase SQL Editor（或经 MCP apply_migration）
-- 与 user_cards 一致：新表 RLS 启用但【不设任何 policy】，仅 service_role 经函数访问。

-- 1) 治愈瞬间：策展（精选）标记 + 抱抱去规范化计数
ALTER TABLE user_cards
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

ALTER TABLE user_cards
  ADD COLUMN IF NOT EXISTS hugs INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_cards_featured
  ON user_cards (featured, created_at DESC);

-- 2) 抱抱：每人每卡一次，记录谁抱过（用于"我的抱抱"与去重）
CREATE TABLE IF NOT EXISTS card_hugs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL,
  user_identifier TEXT NOT NULL,
  user_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE card_hugs ENABLE ROW LEVEL SECURITY;
-- 刻意不创建 policy：仅 service_role（/.netlify/functions/user-cards）可读写。

CREATE INDEX IF NOT EXISTS idx_card_hugs_card ON card_hugs (card_id);
CREATE INDEX IF NOT EXISTS idx_card_hugs_uniq ON card_hugs (card_id, user_identifier);

-- 3) 举报：覆盖治愈瞬间(user_card) 与 社区帖(community_post)
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_type TEXT NOT NULL,        -- 'user_card' | 'community_post'
  target_id TEXT NOT NULL,
  reporter_id TEXT,
  reporter_type TEXT,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT DEFAULT 'open',       -- open | resolved
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- 刻意不创建 policy：仅 service_role（/.netlify/functions/reports）可读写。

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_type, target_id);
