-- Lead intent foundation for SayOK /new-deal.
-- Run in Supabase SQL Editor if migrations are not applied automatically.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  auth_provider text,
  company_domain text,
  role_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  marketing_consent boolean NOT NULL DEFAULT false,
  consent_timestamp timestamptz
);

CREATE TABLE IF NOT EXISTS public.lead_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  input_url text NOT NULL,
  target_market text NOT NULL,
  business_goal text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text,
  referrer text,
  locale text,
  ip_country text,
  run_status text NOT NULL DEFAULT 'started'
);

CREATE TABLE IF NOT EXISTS public.run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.lead_runs(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  organization_website text,
  contact_name text,
  contact_role text,
  masked_email text,
  email_status text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.run_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.lead_runs(id) ON DELETE CASCADE,
  direction text,
  user_industry text,
  target_industry text,
  target_region text,
  goal_type text,
  cross_border boolean,
  japan_market_intent boolean NOT NULL DEFAULT false,
  confidence numeric(3,2),
  raw_response text,
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_runs_target_market ON public.lead_runs USING gin (to_tsvector('simple', target_market));
CREATE INDEX IF NOT EXISTS idx_lead_runs_ip_country ON public.lead_runs (ip_country);
CREATE INDEX IF NOT EXISTS idx_lead_runs_created_at ON public.lead_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_segments_japan_market_intent ON public.run_segments (japan_market_intent);
CREATE INDEX IF NOT EXISTS idx_run_segments_target_region ON public.run_segments (target_region);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_segments ENABLE ROW LEVEL SECURITY;

-- No public policies. These tables are written by server-side service role only.
