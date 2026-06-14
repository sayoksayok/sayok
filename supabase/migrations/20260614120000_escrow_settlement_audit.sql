-- Mantle Sepolia escrow settlement audit records.
-- This is for the SayOK /new-deal/settlement demo only. No mainnet funds.

CREATE TABLE IF NOT EXISTS public.escrow_settlement_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id text NOT NULL,
  agent_reasoning text NOT NULL,
  proposed_amount text NOT NULL,
  payee text NOT NULL,
  tx_hash text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'deposited', 'released', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_audits_referral_id ON public.escrow_settlement_audits (referral_id);
CREATE INDEX IF NOT EXISTS idx_escrow_audits_status ON public.escrow_settlement_audits (status);
CREATE INDEX IF NOT EXISTS idx_escrow_audits_created_at ON public.escrow_settlement_audits (created_at DESC);

ALTER TABLE public.escrow_settlement_audits ENABLE ROW LEVEL SECURITY;

-- No public policies. The demo writes audit records through server-side service role only.
