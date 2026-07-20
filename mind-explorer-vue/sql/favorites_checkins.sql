-- P5-5 收藏 + 打卡 数据层
-- 与 companion / mood / user_cards 一致：全部经 Netlify Function（service_role）中转，
-- RLS 启用但【不设任何 policy】，仅 service_role 可访问，前端不直连。

-- ============ 收藏 user_favorites ============
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identifier TEXT NOT NULL,
  item_type TEXT NOT NULL,            -- moment | post | card | quote
  item_id TEXT NOT NULL,
  title TEXT,                         -- 快照：便于「我的收藏」直接展示，无需回查
  summary TEXT,
  link TEXT,                          -- 跳转路由，如 /user-card/:id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fav_user ON user_favorites(user_identifier);
CREATE INDEX IF NOT EXISTS idx_fav_uniq ON user_favorites(user_identifier, item_type, item_id);

-- ============ 打卡 user_checkins ============
CREATE TABLE IF NOT EXISTS user_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identifier TEXT NOT NULL,
  checkin_date DATE NOT NULL,         -- YYYY-MM-DD（本地日期）
  source TEXT DEFAULT 'mood',         -- mood | practice
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_identifier, checkin_date)  -- 每天仅一条
);
ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_checkin_user ON user_checkins(user_identifier);
