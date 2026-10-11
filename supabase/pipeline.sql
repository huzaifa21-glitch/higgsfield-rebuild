-- Generation pipeline: credits, row-level security and realtime broadcasts.
-- Run in the Supabase SQL editor. Safe to re-run.

-- 1. Sessions: credits can never go negative, plus a separate key for realtime.
--    The session id is the auth credential (httpOnly cookie), so it never goes to the browser.
--    realtime_key is a second random id the client may know; it only names a broadcast channel.
alter table public.sessions
  add column if not exists realtime_key uuid not null default gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_credits_nonnegative') then
    alter table public.sessions add constraint sessions_credits_nonnegative check (credits >= 0);
  end if;
end $$;

create index if not exists jobs_session_created_idx on public.jobs (session_id, created_at desc);

-- 2. Atomic credit functions. A single UPDATE takes a row lock, so two concurrent spends
--    can't both pass the balance check.

-- Returns the new balance, or null if the session doesn't exist or can't afford it.
create or replace function public.spend_credits(p_session_id uuid, p_cost int)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.sessions
     set credits = credits - p_cost
   where id = p_session_id
     and p_cost > 0
     and credits >= p_cost
  returning credits;
$$;

-- Returns the new balance, or null if the session doesn't exist.
create or replace function public.refund_credits(p_session_id uuid, p_amount int)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.sessions
     set credits = credits + p_amount
   where id = p_session_id
     and p_amount > 0
  returning credits;
$$;

-- Functions in public are callable by anyone through the REST API unless revoked.
-- Only the server (service_role) may move credits.
revoke all on function public.spend_credits(uuid, int) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid, int) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, int) to service_role;
grant execute on function public.refund_credits(uuid, int) to service_role;

-- 3. Row-level security. All reads and writes go through /api with the service role,
--    which bypasses RLS. With no policies, the anon key can read or write nothing.
alter table public.sessions enable row level security;
alter table public.jobs enable row level security;
alter table public.characters enable row level security;
alter table public.presets enable row level security;

-- 4. Realtime: broadcast job and credit changes to the session's channel, jobs:<realtime_key>.
--    Broadcast (not postgres_changes) so the browser never needs read access to the jobs table.
create or replace function public.broadcast_job_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k uuid;
begin
  select realtime_key into k from public.sessions where id = new.session_id;
  if k is not null then
    perform realtime.send(to_jsonb(new) - 'session_id', 'job', 'jobs:' || k::text, false);
  end if;
  return null;
end;
$$;

create or replace trigger jobs_broadcast
  after insert or update on public.jobs
  for each row execute function public.broadcast_job_change();

create or replace function public.broadcast_credits_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('credits', new.credits), 'credits', 'jobs:' || new.realtime_key::text, false);
  return null;
end;
$$;

create or replace trigger sessions_broadcast_credits
  after update of credits on public.sessions
  for each row execute function public.broadcast_credits_change();

-- 5. Check: every table should show rowsecurity = true, and the policy list should be empty
--    (any policy listed here grants the anon key access you may not want).
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('sessions', 'jobs', 'characters', 'presets');
select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public';
