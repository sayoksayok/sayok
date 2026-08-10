-- Sales-agent multi-sender Gmail accounts and product routing.
-- OAuth tokens remain server-only and encrypted before storage.

create table if not exists public.sales_agent_google_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  user_id uuid not null,
  google_email text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'needs_reauth', 'revoked', 'error')),
  daily_send_limit integer not null default 20
    check (daily_send_limit between 1 and 500),
  last_error text,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, google_email)
);

-- Preserve the existing single-account connection when enabling multi-sender.
-- Tokens were encrypted with the same GOOGLE_TOKEN_ENCRYPTION_KEY, so they can
-- be copied without decrypting them in the migration.
insert into public.sales_agent_google_accounts (
  workspace_id,
  user_id,
  google_email,
  encrypted_access_token,
  encrypted_refresh_token,
  token_expires_at,
  scopes,
  status,
  last_error,
  connected_at,
  created_at,
  updated_at
)
select
  workspace_id,
  user_id,
  lower(trim(google_email)),
  encrypted_access_token,
  encrypted_refresh_token,
  token_expires_at,
  scopes,
  status,
  last_error,
  connected_at,
  created_at,
  updated_at
from public.work_os_google_connections
where google_email is not null
  and trim(google_email) <> ''
  and encrypted_access_token is not null
  and gmail_connected = true
on conflict (workspace_id, user_id, google_email) do nothing;

create table if not exists public.sales_agent_product_senders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.work_os_workspaces(id) on delete cascade,
  user_id uuid not null,
  product text not null check (product in ('DOGEDAY', 'ALTLIER', 'LOOQ')),
  sender_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, product),
  foreign key (workspace_id, user_id, sender_email)
    references public.sales_agent_google_accounts(workspace_id, user_id, google_email)
    on update cascade on delete restrict
);

create index if not exists sales_agent_google_accounts_owner_idx
  on public.sales_agent_google_accounts(workspace_id, user_id, status);
create index if not exists sales_agent_google_accounts_sender_idx
  on public.sales_agent_google_accounts(workspace_id, google_email);
create index if not exists sales_agent_product_senders_owner_idx
  on public.sales_agent_product_senders(workspace_id, user_id, product);

alter table public.sales_agent_google_accounts enable row level security;
alter table public.sales_agent_product_senders enable row level security;

-- Deliberately no client policies. Tokens and routing are accessed only by
-- authenticated server routes using the Supabase service role.
