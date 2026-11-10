-- S3 身份校验观测计数表 · 2026-11-10
--
-- 用途：把 content 里 observeOwner 的裁决结果跨 isolate 持久化，
--       为「什么时候把 mood.* / card.* 切成硬拒」提供可信数据。
--
-- 为什么需要这张表：原先计数只在进程内存里，实测低流量下 isolate 几乎每次冷启动，
--   计数永远归零，s3.stats 恒为空。内存方案在这条线上不成立。
--
-- 本文件可重复执行（幂等）。
-- 执行位置：Supabase Dashboard → SQL Editor（整份粘贴执行）。

-- ---------------------------------------------------------------------------
-- 1. 表
-- ---------------------------------------------------------------------------
create table if not exists public.owner_guard_stats (
  day        date        not null,
  hour       smallint    not null check (hour between 0 and 23),
  action     text        not null,
  verdict    text        not null,
  count      bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, hour, action, verdict)
);

-- 与现有 9 张表一致：开 RLS、**不建任何 policy**
--   ⇒ anon / authenticated 一律拒绝；service_role 自带 BYPASSRLS，读写正常。
--   「能调用 RPC」≠「能写入」这一条由 RLS 兜底，REVOKE 只是纵深防御。
alter table public.owner_guard_stats enable row level security;

comment on table  public.owner_guard_stats is
  'S3 身份校验观测计数，按 UTC+8 小时分桶。仅 service_role 可读写（RLS 无 policy）。';
comment on column public.owner_guard_stats.hour is
  'UTC+8 的小时（0-23）。中国无夏令时，固定 +8。';
comment on column public.owner_guard_stats.verdict is
  'guardOwner 的裁决：ok / token_absent / token_expired / token_invalid / uid_exact / uid_shorthand / uid_mismatch / off:xxx / write_failed';

-- ---------------------------------------------------------------------------
-- 2. 原子递增函数
-- ---------------------------------------------------------------------------
-- 为什么需要函数：PostgREST 的 PATCH body 只能写字面值，表达不了 count = count + 1；
--   Prefer: resolution=merge-duplicates 只能整值覆盖，读-改-写必有竞态。
--
-- 为什么 SECURITY INVOKER（不是 DEFINER）：service_role 本就 BYPASSRLS，
--   写入不需要提权；DEFINER 只会平白扩大攻击面。
create or replace function public.increment_owner_guard_stats(
  p_day     date,
  p_hour    smallint,
  p_action  text,
  p_verdict text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.owner_guard_stats (day, hour, action, verdict, count)
  values (p_day, p_hour, p_action, p_verdict, 1)
  on conflict (day, hour, action, verdict)
  do update set count      = owner_guard_stats.count + 1,
                updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 权限：显式收回
-- ---------------------------------------------------------------------------
-- Postgres 默认把新函数的 EXECUTE 授给 PUBLIC；
-- Supabase 还对 anon / authenticated / service_role 设过默认权限，
-- 所以只撤 PUBLIC 会漏掉命名角色。
revoke execute on function public.increment_owner_guard_stats(date, smallint, text, text)
  from public, anon, authenticated;

-- service_role 保留（显式写出，避免依赖默认权限）
grant execute on function public.increment_owner_guard_stats(date, smallint, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. 自检（执行完看这个输出）
-- ---------------------------------------------------------------------------
-- 下面的查询只做展示，不影响任何数据。
select
  (select count(*) from public.owner_guard_stats)                                as existing_rows,
  (select relrowsecurity from pg_class where oid = 'public.owner_guard_stats'::regclass) as rls_enabled,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'owner_guard_stats')            as policy_count,
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_owner_guard_stats')    as is_security_definer;
-- 期望：existing_rows=0、rls_enabled=true、policy_count=0、is_security_definer=false
