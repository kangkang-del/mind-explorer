-- ============================================================
-- M4 批次 N：小木跨设备同步状态
-- 作用：让「自定义形象 / 换装 / 衣柜解锁 / 累计使用天数」跟着账号走，
--       换设备（或换浏览器）后自动恢复。
-- 执行：请在 Supabase 后台 → SQL Editor 里整段执行（幂等，可重复跑）。
--
-- 隐私：启用 RLS 且不设任何 policy，前端不可直连；
--       仅 content 函数用 service_role key（绕过 RLS）读写。
--
-- 乐观锁：version 由服务端 +1。客户端 put 时把「自己手里的 version」写进
--         UPDATE 的 WHERE，只有版本相符才命中 —— 这是原子 CAS，不是「先读再写」。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xiaomu_user_state (
  user_identifier text PRIMARY KEY,
  version         bigint      NOT NULL DEFAULT 1,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS：默认无 policy = 对 anon / authenticated 全部拒绝；仅 service_role 可读写
ALTER TABLE public.xiaomu_user_state ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 皮肤图片私有桶
-- 权限：public = false（私有桶）。所有读写都经 content 函数用 service_role 中转，
--       前端只拿「短时签名 URL」（1 小时），永远拿不到 Storage 密钥，也猜不到别人的路径。
-- 限制：单文件 1MB；仅允许 webp / png / jpeg（前端已缩到 512px 并转 webp，通常 <200KB）
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'xiaomu-skins',
  'xiaomu-skins',
  false,
  1048576,
  ARRAY['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 提示：私有桶 + 只走 service_role ⇒ 不需要（也不应）给 storage.objects 建任何
-- anon/authenticated 的 policy。若你之前建过针对本桶的放开策略，请删除。
