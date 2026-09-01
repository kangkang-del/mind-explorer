-- 小木人格记忆库：1000 条人生经历种子
-- 原 Netlify 版 xiaomu_seed.js 内嵌 ALL_MEMORIES（约 141KB），
-- 因 Edge Function 部署包体积限制迁移入库；函数运行时惰性拉取 + 模块级缓存。
--
-- RLS 启用但不设开放 policy = 仅 service_role（Edge Function 内部）可读写。
--
-- 数据状态：1000 条记忆已导入生产库（通过 companion 的 import_seed 幂等动作导入）。
-- 如需在新 Supabase 项目重建：
--   1. 先部署 supabase/functions/（见 companion/index.js 头注释）
--   2. 用本应用迁移建表
--   3. 从旧项目导出 xiaomu_seed_memories 数据（Dashboard 可导 CSV / 或用旧库的
--      REST API 全量拉取），再 POST 到新项目函数的 import_seed 动作导入。

CREATE TABLE IF NOT EXISTS public.xiaomu_seed_memories (
  n integer PRIMARY KEY,
  stage text NOT NULL,
  text text NOT NULL
);

ALTER TABLE public.xiaomu_seed_memories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_xiaomu_seed_memories_n ON public.xiaomu_seed_memories (n ASC);
