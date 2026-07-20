-- SayOK Work OS foundation
-- Private, workspace-scoped work graph. No demo data. Every work item has one current state.

create table if not exists public.work_os_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  company_name text,
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_os_members (
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.work_os_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  name text not null,
  business_area text,
  client_company text,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_os_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  project_id uuid references public.work_os_projects(id) on delete set null,
  title text not null,
  description text,
  client_company text,
  owner_name text not null default 'Me',
  source text not null default 'manual',
  status text not null default 'inbox' check (
    status in (
      'inbox',
      'needs_clarification',
      'ready',
      'in_progress',
      'prepared_by_sayok',
      'needs_user_approval',
      'scheduled',
      'waiting_on_someone',
      'delegated',
      'blocked',
      'done',
      'cancelled',
      'not_relevant',
      'archived'
    )
  ),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at timestamptz,
  start_at timestamptz,
  estimated_minutes integer,
  commercial_value numeric,
  dependency text,
  blocker text,
  waiting_for_person text,
  follow_up_at timestamptz,
  related_email text,
  related_meeting text,
  related_opportunity text,
  completion_record jsonb,
  agent_notes text,
  user_notes text,
  prepared_output text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_os_activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  task_id uuid references public.work_os_tasks(id) on delete cascade,
  project_id uuid references public.work_os_projects(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'sayok', 'integration')),
  event_type text not null,
  summary text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.work_os_prepared_work (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  task_id uuid references public.work_os_tasks(id) on delete cascade,
  kind text not null default 'draft',
  title text not null,
  body text not null,
  status text not null default 'prepared' check (status in ('prepared', 'approved', 'rejected', 'used')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_os_members_user_idx on public.work_os_members(user_id);
create index if not exists work_os_tasks_workspace_status_due_idx on public.work_os_tasks(workspace_id, status, due_at);
create index if not exists work_os_tasks_workspace_follow_up_idx on public.work_os_tasks(workspace_id, follow_up_at);
create index if not exists work_os_projects_workspace_idx on public.work_os_projects(workspace_id, status);
create index if not exists work_os_activity_workspace_created_idx on public.work_os_activity_events(workspace_id, created_at desc);

alter table public.work_os_workspaces enable row level security;
alter table public.work_os_members enable row level security;
alter table public.work_os_projects enable row level security;
alter table public.work_os_tasks enable row level security;
alter table public.work_os_activity_events enable row level security;
alter table public.work_os_prepared_work enable row level security;

create or replace function public.is_work_os_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.work_os_members m
    where m.workspace_id = target_workspace_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_work_os_workspace(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.work_os_members m
    where m.workspace_id = target_workspace_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

create policy "workspaces visible to members"
  on public.work_os_workspaces for select
  using (public.is_work_os_member(id));

create policy "users create own workspaces"
  on public.work_os_workspaces for insert
  with check (owner_id = auth.uid());

create policy "workspace owners update workspace"
  on public.work_os_workspaces for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "workspace owners delete workspace"
  on public.work_os_workspaces for delete
  using (owner_id = auth.uid());

create policy "members visible to same workspace members"
  on public.work_os_members for select
  using (public.is_work_os_member(workspace_id));

create policy "users add themselves as workspace owner"
  on public.work_os_members for insert
  with check (user_id = auth.uid() and role = 'owner');

create policy "owners manage members"
  on public.work_os_members for all
  using (public.can_manage_work_os_workspace(workspace_id))
  with check (public.can_manage_work_os_workspace(workspace_id));

create policy "members manage projects"
  on public.work_os_projects for all
  using (public.is_work_os_member(workspace_id))
  with check (public.is_work_os_member(workspace_id));

create policy "members manage tasks"
  on public.work_os_tasks for all
  using (public.is_work_os_member(workspace_id))
  with check (public.is_work_os_member(workspace_id));

create policy "members manage activity"
  on public.work_os_activity_events for all
  using (public.is_work_os_member(workspace_id))
  with check (public.is_work_os_member(workspace_id));

create policy "members manage prepared work"
  on public.work_os_prepared_work for all
  using (public.is_work_os_member(workspace_id))
  with check (public.is_work_os_member(workspace_id));
