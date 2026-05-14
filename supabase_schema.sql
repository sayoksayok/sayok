-- Run this in Supabase SQL Editor (Dashboard > SQL Editor) to create tables for SayOK Pro.

-- Users table: one row per auth user (created on first login). Google sub is stored in auth.users; we use id = auth.uid().
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_pro boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If table already exists without these columns, add them:
-- alter table public.users add column if not exists email text;
-- alter table public.users add column if not exists stripe_customer_id text;
-- alter table public.users add column if not exists stripe_subscription_id text;
-- alter table public.users add column if not exists stripe_subscription_status text;

-- RLS: users can read/update only their own row; insert allowed for own id (first login).
alter table public.users enable row level security;

create policy "Users can read own row"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can insert own row"
  on public.users for insert
  with check (auth.uid() = id);

create policy "Users can update own row"
  on public.users for update
  using (auth.uid() = id);

-- Translation history: for logged-in users only.
create table if not exists public.translation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  input_text text not null,
  detected_language text,
  target_language text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.translation_history enable row level security;

create policy "Users can read own history"
  on public.translation_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own history"
  on public.translation_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own history"
  on public.translation_history for delete
  using (auth.uid() = user_id);
