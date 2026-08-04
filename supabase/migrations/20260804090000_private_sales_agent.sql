-- Private SayOK sales agent: encrypted Gmail connection, send audit, and suppression list.

create table if not exists public.sales_agent_google_connections (
  user_id uuid primary key,
  google_email text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'revoked', 'error')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_agent_email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  google_email text not null,
  organization text not null,
  to_email text not null,
  subject text not null,
  source_url text not null,
  gmail_message_id text,
  gmail_thread_id text,
  status text not null default 'approved' check (status in ('approved', 'sent', 'failed')),
  error text,
  approved_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_agent_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  reason text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index if not exists sales_agent_email_sends_user_created_idx
  on public.sales_agent_email_sends(user_id, created_at desc);
create index if not exists sales_agent_email_sends_recipient_idx
  on public.sales_agent_email_sends(user_id, to_email, status);

alter table public.sales_agent_google_connections enable row level security;
alter table public.sales_agent_email_sends enable row level security;
alter table public.sales_agent_suppressions enable row level security;

-- OAuth tokens are server-only; no client policy is intentionally defined.
create policy "users read own sales email audit"
  on public.sales_agent_email_sends for select
  using (user_id = auth.uid());

create policy "users read own sales suppressions"
  on public.sales_agent_suppressions for select
  using (user_id = auth.uid());
