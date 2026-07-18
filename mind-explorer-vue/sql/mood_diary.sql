-- ============================================================
-- P5-4：心情日记
-- 作用：用户每日情绪打卡，供情绪曲线与（后续）小木主动关怀使用
-- 执行：已通过 Supabase MCP apply_migration 应用；此文件仅作版本记录
-- 隐私：启用 RLS 且不设任何 policy，前端不可直连，
--       仅 mood 函数用 service_role key（绕过 RLS）读写
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mood_diary (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_identifier text NOT NULL,
  emotion text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mood_diary_user_time
  ON public.mood_diary (user_identifier, created_at DESC);

-- RLS：默认无 policy = 对 anon / authenticated 全部拒绝；仅 service_role 可读写
ALTER TABLE public.mood_diary ENABLE ROW LEVEL SECURITY;
