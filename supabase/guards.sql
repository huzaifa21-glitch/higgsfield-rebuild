-- Production guards: session farming, rate limits, degraded mode, refund tracking.
-- Run in the Supabase SQL editor after pipeline.sql. Safe to re-run.

-- 1. Session farming: a salted hash of the client IP (never the raw IP), and whether the
--    starter credits were withheld because this network already started 3 sessions today.
alter table public.sessions add column if not exists ip_hash text;
alter table public.sessions add column if not exists starter_withheld boolean not null default false;
create index if not exists sessions_ip_created_idx on public.sessions (ip_hash, created_at desc);

-- 2. Fixed-window rate-limit counters, one row per key per window.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

-- Counts one hit and returns the total for the current window plus when it resets.
-- A single upsert, so concurrent requests can't both read a stale count.
create or replace function public.hit_rate_limit(p_key text, p_window_seconds int)
returns table (hits int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Occasional cleanup keeps the table tiny without a cron job.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 hour';
  end if;

  return query select v_count, v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.hit_rate_limit(text, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int) to service_role;

-- 3. Global flags, e.g. 'ai_degraded' until the free Workers AI allocation resets.
create table if not exists public.app_flags (
  name text primary key,
  until timestamptz,
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;

-- 4. Jobs: whether the cost was refunded (failures, and demo fallbacks when AI capacity runs out).
alter table public.jobs add column if not exists refunded boolean not null default false;
create index if not exists jobs_status_created_idx on public.jobs (status, created_at) where status in ('queued', 'running');

-- Check: these should all return rows.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'sessions' and column_name in ('ip_hash', 'starter_withheld');
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('rate_limits', 'app_flags');
