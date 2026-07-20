-- SayOK Relationship and Deal Execution OS
-- Adds the data model for people, companies, opportunities, interactions, next actions, and drafts.
-- These tables are scoped to auth.uid() and are intentionally simple for the founder-led MVP.

create table if not exists public.relationship_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  website text,
  industry text,
  stage text,
  location text,
  description text,
  potential_need text,
  market_relevance text,
  budget_estimate text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid references public.relationship_companies(id) on delete set null,
  name text not null,
  role text,
  company_name text,
  email text,
  location text,
  preferred_channel text,
  relationship_strength text not null default 'weak',
  how_we_met text,
  last_interaction_at timestamptz,
  next_follow_up_at timestamptz,
  tags text[] not null default '{}',
  potential_value numeric,
  mutual_contacts text[] not null default '{}',
  notes text,
  social_links text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  person_id uuid references public.relationship_people(id) on delete set null,
  company_id uuid references public.relationship_companies(id) on delete set null,
  title text not null,
  desired_ok text not null,
  stage text not null default 'New',
  estimated_value numeric,
  probability integer not null default 20,
  priority text not null default 'medium',
  next_action text,
  next_action_due_at timestamptz,
  last_interaction_at timestamptz,
  blocker text,
  notes text,
  status text not null default 'active',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.relationship_opportunities(id) on delete set null,
  happened_at timestamptz not null default now(),
  type text not null default 'Note',
  summary text not null,
  participant_ids uuid[] not null default '{}',
  raw_content text,
  sentiment text,
  commitments text[] not null default '{}',
  follow_up_items text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.relationship_next_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.relationship_opportunities(id) on delete cascade,
  person_id uuid references public.relationship_people(id) on delete set null,
  company_id uuid references public.relationship_companies(id) on delete set null,
  title text not null,
  due_at timestamptz,
  priority text not null default 'medium',
  status text not null default 'open',
  kind text not null default 'follow_up',
  recommendation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid references public.relationship_opportunities(id) on delete set null,
  person_id uuid references public.relationship_people(id) on delete set null,
  channel text not null default 'Email',
  subject text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists relationship_people_user_next_follow_up_idx
  on public.relationship_people(user_id, next_follow_up_at);

create index if not exists relationship_opportunities_user_stage_idx
  on public.relationship_opportunities(user_id, stage);

create index if not exists relationship_opportunities_user_status_due_idx
  on public.relationship_opportunities(user_id, status, next_action_due_at);

create index if not exists relationship_next_actions_user_status_due_idx
  on public.relationship_next_actions(user_id, status, due_at);

create index if not exists relationship_interactions_user_happened_at_idx
  on public.relationship_interactions(user_id, happened_at desc);

alter table public.relationship_companies enable row level security;
alter table public.relationship_people enable row level security;
alter table public.relationship_opportunities enable row level security;
alter table public.relationship_interactions enable row level security;
alter table public.relationship_next_actions enable row level security;
alter table public.relationship_drafts enable row level security;

create policy "Users can manage own relationship companies"
  on public.relationship_companies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own relationship people"
  on public.relationship_people for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own relationship opportunities"
  on public.relationship_opportunities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own relationship interactions"
  on public.relationship_interactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own relationship next actions"
  on public.relationship_next_actions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own relationship drafts"
  on public.relationship_drafts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
