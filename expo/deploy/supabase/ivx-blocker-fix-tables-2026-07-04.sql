-- =============================================================================
-- IVX Blocker Fix Migration — 2026-07-04
-- Idempotent. Safe to re-run.
-- Creates 5 missing tables: investors, developer_proof_ledger, lenders, revenue, wallet
-- RLS: service_role bypasses; owners read/write; anon/authenticated read where public.
-- =============================================================================

-- ---------- investors ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.investors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT,
  accreditation   TEXT,
  investment_tier TEXT,
  capital_committed NUMERIC(14,2) NOT NULL DEFAULT 0,
  capital_deployed  NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investors_email_idx ON public.investors (email);
CREATE INDEX IF NOT EXISTS investors_status_idx ON public.investors (status);

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS investors_owner_select ON public.investors;
CREATE POLICY investors_owner_select
  ON public.investors FOR SELECT USING (public.ivx_is_owner());

DROP POLICY IF EXISTS investors_owner_write ON public.investors;
CREATE POLICY investors_owner_write
  ON public.investors FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- developer_proof_ledger -----------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_proof_ledger (
  task_id              TEXT PRIMARY KEY,
  chat_message_id      TEXT,
  requested_by         TEXT NOT NULL DEFAULT '',
  action_type          TEXT NOT NULL DEFAULT '',
  files_changed        JSONB NOT NULL DEFAULT '[]'::jsonb,
  git_diff_summary     TEXT,
  tests_run            JSONB,
  test_result          TEXT,
  typecheck_result     TEXT,
  commit_sha           TEXT,
  commit_url           TEXT,
  render_deploy_id     TEXT,
  render_deploy_status TEXT,
  live_url_tested      TEXT,
  live_http_status     INTEGER,
  live_response_snippet TEXT,
  deployed_commit      TEXT,
  commit_match         BOOLEAN NOT NULL DEFAULT FALSE,
  final_status         TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dev_proof_created_idx ON public.developer_proof_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS dev_proof_action_idx ON public.developer_proof_ledger (action_type);

ALTER TABLE public.developer_proof_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dev_proof_owner_select ON public.developer_proof_ledger;
CREATE POLICY dev_proof_owner_select
  ON public.developer_proof_ledger FOR SELECT USING (public.ivx_is_owner());

DROP POLICY IF EXISTS dev_proof_owner_write ON public.developer_proof_ledger;
CREATE POLICY dev_proof_owner_write
  ON public.developer_proof_ledger FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- lenders --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lenders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name     TEXT NOT NULL DEFAULT '',
  lender_type     TEXT NOT NULL DEFAULT 'private',
  loan_size_min   NUMERIC(14,2) NOT NULL DEFAULT 0,
  loan_size_max   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ltv_max         NUMERIC(5,2) NOT NULL DEFAULT 0,
  interest_rate   NUMERIC(6,3) NOT NULL DEFAULT 0,
  markets         JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lenders_type_idx ON public.lenders (lender_type);
CREATE INDEX IF NOT EXISTS lenders_status_idx ON public.lenders (approval_status);

ALTER TABLE public.lenders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lenders_owner_select ON public.lenders;
CREATE POLICY lenders_owner_select
  ON public.lenders FOR SELECT USING (public.ivx_is_owner());

DROP POLICY IF EXISTS lenders_owner_write ON public.lenders;
CREATE POLICY lenders_owner_write
  ON public.lenders FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- revenue --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revenue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT '',
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  period          TEXT NOT NULL DEFAULT '',
  property_id     TEXT,
  deal_id         TEXT,
  status          TEXT NOT NULL DEFAULT 'recorded',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS revenue_period_idx ON public.revenue (period);
CREATE INDEX IF NOT EXISTS revenue_source_idx ON public.revenue (source);

ALTER TABLE public.revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revenue_owner_select ON public.revenue;
CREATE POLICY revenue_owner_select
  ON public.revenue FOR SELECT USING (public.ivx_is_owner());

DROP POLICY IF EXISTS revenue_owner_write ON public.revenue;
CREATE POLICY revenue_owner_write
  ON public.revenue FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- wallet ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT 'main',
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending         NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'active',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_user_idx ON public.wallet (user_id);
CREATE INDEX IF NOT EXISTS wallet_status_idx ON public.wallet (status);

ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_owner_select ON public.wallet;
CREATE POLICY wallet_owner_select
  ON public.wallet FOR SELECT USING (public.ivx_is_owner());

DROP POLICY IF EXISTS wallet_owner_write ON public.wallet;
CREATE POLICY wallet_owner_write
  ON public.wallet FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- wallets table alias (handleMembersDashboard uses 'wallets') ----
-- handleMembersDashboard queries sb.from('wallets'); create a view alias.
CREATE OR REPLACE VIEW public.wallets AS SELECT * FROM public.wallet;

GRANT SELECT ON public.wallets TO authenticated, anon, service_role;
