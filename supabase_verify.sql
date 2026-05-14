-- ============================================================
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- Paste this entire file and click "Run". It only READS, no changes.
-- ============================================================

-- 1. Check if public.users exists and list its columns
SELECT
  'users' AS table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check if public.translation_history exists and list its columns
SELECT
  'translation_history' AS table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'translation_history'
ORDER BY ordinal_position;

-- 3. Verify users has required columns (run separately if you want a simple pass/fail)
-- Expected: id, email, is_pro, stripe_customer_id, stripe_subscription_status, created_at, updated_at
SELECT
  CASE
    WHEN COUNT(*) FILTER (WHERE column_name = 'id') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'email') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'is_pro') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'stripe_customer_id') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'stripe_subscription_status') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'created_at') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'updated_at') = 1
    THEN 'OK: users has all required columns including email'
    ELSE 'MISSING: users is missing one or more columns (likely email). Run: alter table public.users add column if not exists email text;'
  END AS users_check
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users';

-- 4. Verify translation_history has required columns
SELECT
  CASE
    WHEN COUNT(*) FILTER (WHERE column_name = 'id') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'user_id') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'input_text') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'detected_language') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'target_language') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'result') = 1
     AND COUNT(*) FILTER (WHERE column_name = 'created_at') = 1
    THEN 'OK: translation_history has all required columns'
    ELSE 'MISSING: translation_history is missing one or more columns'
  END AS history_check
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'translation_history';
