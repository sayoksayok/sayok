-- SayOK Work OS Google integrations
-- Stores encrypted OAuth tokens server-side and workspace-scoped sync outputs.

create table if not exists public.work_os_user_profiles (
  user_id uuid primary key,
  email text not null,
  full_name text,
  avatar_url text,
  auth_provider text not null default 'google',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_os_google_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  user_id uuid not null,
  google_email text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  gmail_connected boolean not null default false,
  calendar_connected boolean not null default false,
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'revoked', 'error')),
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.work_os_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  user_id uuid not null,
  provider text not null default 'google',
  status text not null check (status in ('running', 'success', 'error')),
  gmail_threads_seen integer not null default 0,
  calendar_events_seen integer not null default 0,
  tasks_created integer not null default 0,
  drafts_created integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.work_os_external_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  provider text not null default 'gmail',
  external_id text not null,
  thread_id text,
  from_email text,
  from_name text,
  to_emails text[] not null default '{}',
  subject text,
  snippet text,
  received_at timestamptz,
  source_url text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_id)
);

create table if not exists public.work_os_calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  provider text not null default 'google_calendar',
  external_id text not null,
  title text not null,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  attendees jsonb not null default '[]',
  source_url text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_id)
);

create index if not exists work_os_google_connections_workspace_idx on public.work_os_google_connections(workspace_id, status);
create index if not exists work_os_sync_runs_workspace_started_idx on public.work_os_sync_runs(workspace_id, started_at desc);
create index if not exists work_os_external_messages_workspace_received_idx on public.work_os_external_messages(workspace_id, received_at desc);
create index if not exists work_os_calendar_events_workspace_start_idx on public.work_os_calendar_events(workspace_id, start_at);

alter table public.work_os_user_profiles enable row level security;
alter table public.work_os_google_connections enable row level security;
alter table public.work_os_sync_runs enable row level security;
alter table public.work_os_external_messages enable row level security;
alter table public.work_os_calendar_events enable row level security;

create policy "users read own profile"
  on public.work_os_user_profiles for select
  using (user_id = auth.uid());

create policy "users update own profile"
  on public.work_os_user_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No client SELECT policy for work_os_google_connections.
-- It contains encrypted OAuth tokens and is read/written only by server routes
-- using the Supabase service role. UI status is exposed through
-- /api/work-os/google/status, which strips token columns.

create policy "members read sync runs"
  on public.work_os_sync_runs for select
  using (public.is_work_os_member(workspace_id));

create policy "members read external messages"
  on public.work_os_external_messages for select
  using (public.is_work_os_member(workspace_id));

create policy "members read calendar events"
  on public.work_os_calendar_events for select
  using (public.is_work_os_member(workspace_id));

create or replace function public.delete_work_os_workspace(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_work_os_workspace(target_workspace_id) then
    raise exception 'not authorized';
  end if;

  delete from public.work_os_workspaces where id = target_workspace_id;
end;
$$;
