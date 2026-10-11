-- Base schema for a fresh Supabase project. Run first, then pipeline.sql, then guards.sql.
-- Mirrors the tables the live project already has, so it is safe to re-run there too.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  credits int not null default 10,
  created_at timestamptz default now()
);

create table if not exists public.presets (
  id text primary key,
  name text not null,
  description text,
  preview_url text,
  kind text not null,              -- 'effect', or 'retired' (kept so past jobs keep their names)
  model text not null,
  prompt_template text not null,
  params jsonb,
  cost int not null,
  featured boolean default false
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id),
  name text not null,
  image_url text not null,
  created_at timestamptz default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id),
  type text not null,              -- 'image' | 'effect' | 'video'
  preset_id text references public.presets (id),
  character_id uuid references public.characters (id),
  parent_job_id uuid references public.jobs (id),
  prompt text,
  enhanced_prompt text,
  input_url text,
  model text not null,
  params jsonb,
  status text not null default 'queued',  -- 'queued' | 'running' | 'done' | 'failed'
  output_url text,
  error text,                      -- an error code, never a raw provider message
  cost int not null,
  is_demo boolean default false,
  is_public boolean default false,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Public buckets: outputs (generated results, demo samples, preset previews) and uploads (inputs, characters).
-- Paths are random UUIDs, never session ids.
insert into storage.buckets (id, name, public)
values ('outputs', 'outputs', true), ('uploads', 'uploads', true)
on conflict (id) do nothing;
