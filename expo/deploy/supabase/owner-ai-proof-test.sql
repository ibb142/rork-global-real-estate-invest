-- =============================================================================
-- owner-ai-proof-test module — Supabase migration
-- Idempotent. Safe to re-run.
--
-- Creates public.owner_ai_proof_test and seeds exactly one verifiable record.
-- Apply with:
--   psql "$SUPABASE_DB_URL" -f expo/deploy/supabase/owner-ai-proof-test.sql
-- or via Supabase Dashboard → SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.owner_ai_proof_test (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status      TEXT NOT NULL DEFAULT 'success',
  source      TEXT NOT NULL DEFAULT 'owner-ai',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS owner_ai_proof_test_created_at_idx
  ON public.owner_ai_proof_test (created_at);

ALTER TABLE public.owner_ai_proof_test ENABLE ROW LEVEL SECURITY;

-- Owner-only read; service_role bypasses RLS for the seed insert below.
DROP POLICY IF EXISTS owner_ai_proof_test_owner_select ON public.owner_ai_proof_test;
CREATE POLICY owner_ai_proof_test_owner_select
  ON public.owner_ai_proof_test FOR SELECT
  USING (public.ivx_is_owner());

-- Seed exactly one test record (only if the table is currently empty).
INSERT INTO public.owner_ai_proof_test (status, source, note)
SELECT 'success', 'owner-ai', 'owner-ai-proof-test end-to-end seed record'
WHERE NOT EXISTS (SELECT 1 FROM public.owner_ai_proof_test);

-- Verification:
--   SELECT count(*) FROM public.owner_ai_proof_test;          -- expect >= 1
--   SELECT status, source, note FROM public.owner_ai_proof_test ORDER BY created_at LIMIT 1;
--   -- expect: success | owner-ai | owner-ai-proof-test end-to-end seed record
