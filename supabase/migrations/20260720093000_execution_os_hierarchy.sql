-- SayOK Execution OS hierarchy
-- User -> Workspace / Organization -> Integrations -> Company data -> Agents -> Tasks / Actions / Approvals

create table if not exists public.sayok_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  role text,
  operating_context text,
  active_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sayok_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sayok_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  category text,
  status text not null default 'not_connected',
  external_account text,
  settings jsonb not null default '{}',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sayok_company_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sayok_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  websites text[] not null default '{}',
  positioning text,
  offers text[] not null default '{}',
  proof_points text[] not null default '{}',
  default_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sayok_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sayok_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  kind text not null,
  job text not null,
  data_sources text[] not null default '{}',
  guardrail text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sayok_execution_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sayok_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  agent_id uuid references public.sayok_agents(id) on delete set null,
  title text not null,
  related_company text,
  related_person text,
  desired_ok text not null,
  reason text,
  prepared_action text,
  due_at timestamptz,
  priority text not null default 'medium',
  status text not null default 'needs_approval',
  approval_required boolean not null default true,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sayok_workspaces_user_idx
  on public.sayok_workspaces(user_id);

create index if not exists sayok_integrations_workspace_status_idx
  on public.sayok_integrations(workspace_id, status);

create index if not exists sayok_company_profiles_workspace_idx
  on public.sayok_company_profiles(workspace_id);

create index if not exists sayok_agents_workspace_kind_idx
  on public.sayok_agents(workspace_id, kind);

create index if not exists sayok_execution_tasks_workspace_status_due_idx
  on public.sayok_execution_tasks(workspace_id, status, due_at);

alter table public.sayok_workspaces enable row level security;
alter table public.sayok_integrations enable row level security;
alter table public.sayok_company_profiles enable row level security;
alter table public.sayok_agents enable row level security;
alter table public.sayok_execution_tasks enable row level security;

create policy "Users can manage own sayok workspaces"
  on public.sayok_workspaces for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own sayok integrations"
  on public.sayok_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own sayok company profiles"
  on public.sayok_company_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own sayok agents"
  on public.sayok_agents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own sayok execution tasks"
  on public.sayok_execution_tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
