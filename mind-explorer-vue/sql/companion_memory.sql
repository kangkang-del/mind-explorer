-- ============================================================
-- P5-1：小木长期记忆 + 用户画像
-- 作用：让小木在服务端持久化多轮对话上下文（跨设备），并维护轻量用户画像
-- 执行：已通过 Supabase MCP apply_migration 应用；此文件仅作版本记录
-- 隐私：两张表均启用 RLS 且不设任何 policy，前端不可直连，
--       仅 companion 函数用 service_role key（绕过 RLS）读写
-- ============================================================

-- 对话记忆表
CREATE TABLE IF NOT EXISTS public.companion_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_identifier text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  emotion text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companion_messages_user_time
  ON public.companion_messages (user_identifier, created_at DESC);

-- 用户画像表
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_identifier text PRIMARY KEY,
  nickname text,
  message_count integer NOT NULL DEFAULT 0,
  last_emotion text,
  emotion_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at timestamptz,
  summary text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS：默认无 policy = 对 anon / authenticated 全部拒绝；仅 service_role 可读写
ALTER TABLE public.companion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
