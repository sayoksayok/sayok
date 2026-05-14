-- Server-side daily check limits (spec §7). Run in Supabase SQL Editor if migrations are not applied automatically.
-- Identity: "u:<uuid>" for logged-in users, "a:<fingerprint>" for guests (hashed IP + salt from app).

CREATE TABLE IF NOT EXISTS public.sayok_daily_usage (
  identity_key text NOT NULL,
  usage_date date NOT NULL,
  check_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (identity_key, usage_date)
);

ALTER TABLE public.sayok_daily_usage ENABLE ROW LEVEL SECURITY;

-- No policies: table is only accessed via service role + SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.sayok_try_consume_check(
  p_identity text,
  p_usage_date date,
  p_limit int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new int;
BEGIN
  INSERT INTO public.sayok_daily_usage (identity_key, usage_date, check_count)
  VALUES (p_identity, p_usage_date, 1)
  ON CONFLICT (identity_key, usage_date)
  DO UPDATE SET check_count = sayok_daily_usage.check_count + 1
  WHERE sayok_daily_usage.check_count < p_limit
  RETURNING sayok_daily_usage.check_count INTO v_new;

  IF v_new IS NULL THEN
    SELECT check_count INTO v_new
    FROM public.sayok_daily_usage
    WHERE identity_key = p_identity AND usage_date = p_usage_date;
    RETURN jsonb_build_object('ok', false, 'count', COALESCE(v_new, 0));
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.sayok_refund_check(
  p_identity text,
  p_usage_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sayok_daily_usage
  SET check_count = GREATEST(0, check_count - 1)
  WHERE identity_key = p_identity
    AND usage_date = p_usage_date
    AND check_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.sayok_try_consume_check(text, date, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sayok_refund_check(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sayok_try_consume_check(text, date, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.sayok_refund_check(text, date) TO service_role;
