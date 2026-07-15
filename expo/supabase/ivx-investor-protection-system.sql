-- IVX Enterprise Investor Protection System — 2026-07-05
--
-- Implements the 12-section investor protection spec on top of the existing
-- treasury hash-chained ledger, investors, wallet, and lenders tables.
--
-- Tables added (all RLS-protected, owner-only by default):
--   ivx_account_states        — deletion-protection state machine
--   ivx_deletion_requests     — owner-approved irreversible deletion audit
--   ivx_recovery_requests     — admin-assisted account recovery audit trail
--   ivx_auth_sessions         — active session registry (view + revoke)
--   ivx_investments           — real estate / JV / private lender / tokenized
--   ivx_withdrawals           — 7-stage withdrawal workflow
--   ivx_wires                 — encrypted bank wire instructions
--   ivx_compliance            — KYC / AML / accreditation / risk flags
--   ivx_protection_audit_log  — immutable action audit (user/admin/IP/device/old/new/reason)
--   ivx_protection_reports    — snapshot reports
--
-- SAFETY: No table here permits hard DELETE of financial history. The state
-- machine moves accounts to archived/closed only; financial rows are immutable.

CREATE TABLE IF NOT EXISTS public.ivx_account_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  account_state TEXT NOT NULL DEFAULT 'active'
    CHECK (account_state IN ('active','suspended','locked','archived','closed')),
  reason TEXT NOT NULL DEFAULT '',
  operator_id TEXT NOT NULL DEFAULT '',
  operator_email TEXT NOT NULL DEFAULT '',
  previous_state TEXT NOT NULL DEFAULT '',
  has_funds BOOLEAN NOT NULL DEFAULT FALSE,
  immutable_financial_history BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_account_states_state_idx ON public.ivx_account_states (account_state);
ALTER TABLE public.ivx_account_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_account_states_owner_select ON public.ivx_account_states;
CREATE POLICY ivx_account_states_owner_select ON public.ivx_account_states
  FOR SELECT USING (public.ivx_is_owner());
DROP POLICY IF EXISTS ivx_account_states_owner_write ON public.ivx_account_states;
CREATE POLICY ivx_account_states_owner_write ON public.ivx_account_states
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_account_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  operator_id TEXT NOT NULL DEFAULT '',
  operator_email TEXT NOT NULL DEFAULT '',
  owner_approved BOOLEAN NOT NULL DEFAULT FALSE,
  owner_approver_id TEXT NOT NULL DEFAULT '',
  second_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  second_confirmer_id TEXT NOT NULL DEFAULT '',
  has_funds BOOLEAN NOT NULL DEFAULT FALSE,
  financial_history_count INTEGER NOT NULL DEFAULT 0,
  final_state TEXT NOT NULL DEFAULT 'requested'
    CHECK (final_state IN ('requested','owner_approved','second_confirmed','archived','rejected','blocked_has_funds')),
  audit_note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_deletion_requests_state_idx ON public.ivx_deletion_requests (final_state);
ALTER TABLE public.ivx_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_deletion_requests_owner_select ON public.ivx_deletion_requests;
CREATE POLICY ivx_deletion_requests_owner_select ON public.ivx_deletion_requests
  FOR SELECT USING (public.ivx_is_owner());
DROP POLICY IF EXISTS ivx_deletion_requests_owner_write ON public.ivx_deletion_requests;
CREATE POLICY ivx_deletion_requests_owner_write ON public.ivx_deletion_requests
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_recovery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','sms','authenticator','admin_assisted')),
  verification_code_hash TEXT NOT NULL DEFAULT '',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0,
  operator_id TEXT NOT NULL DEFAULT '',
  operator_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','expired','completed')),
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_recovery_requests_status_idx ON public.ivx_recovery_requests (status);
ALTER TABLE public.ivx_recovery_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_recovery_requests_owner_select ON public.ivx_recovery_requests;
CREATE POLICY ivx_recovery_requests_owner_select ON public.ivx_recovery_requests
  FOR SELECT USING (public.ivx_is_owner() OR auth.uid() = user_id);
DROP POLICY IF EXISTS ivx_recovery_requests_owner_write ON public.ivx_recovery_requests;
CREATE POLICY ivx_recovery_requests_owner_write ON public.ivx_recovery_requests
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_by TEXT NOT NULL DEFAULT '',
  revoked_reason TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_auth_sessions_user_idx ON public.ivx_auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS ivx_auth_sessions_active_idx ON public.ivx_auth_sessions (active);
ALTER TABLE public.ivx_auth_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_auth_sessions_owner_select ON public.ivx_auth_sessions;
CREATE POLICY ivx_auth_sessions_owner_select ON public.ivx_auth_sessions
  FOR SELECT USING (public.ivx_is_owner() OR auth.uid() = user_id);
DROP POLICY IF EXISTS ivx_auth_sessions_owner_write ON public.ivx_auth_sessions;
CREATE POLICY ivx_auth_sessions_owner_write ON public.ivx_auth_sessions
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  investment_type TEXT NOT NULL
    CHECK (investment_type IN ('real_estate','jv_deal','private_lender','tokenized')),
  property_id TEXT NOT NULL DEFAULT '',
  deal_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  amount_invested NUMERIC(14,2) NOT NULL DEFAULT 0,
  ownership_percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  current_valuation NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit_distributed NUMERIC(14,2) NOT NULL DEFAULT 0,
  token_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','completed','distributed','cancelled')),
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_investments_user_idx ON public.ivx_investments (user_id);
CREATE INDEX IF NOT EXISTS ivx_investments_type_idx ON public.ivx_investments (investment_type);
CREATE INDEX IF NOT EXISTS ivx_investments_status_idx ON public.ivx_investments (status);
ALTER TABLE public.ivx_investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_investments_owner_select ON public.ivx_investments;
CREATE POLICY ivx_investments_owner_select ON public.ivx_investments
  FOR SELECT USING (public.ivx_is_owner() OR auth.uid() = user_id);
DROP POLICY IF EXISTS ivx_investments_owner_write ON public.ivx_investments;
CREATE POLICY ivx_investments_owner_write ON public.ivx_investments
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  available_balance_at_request NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','under_review','approved','rejected','sent','completed')),
  compliance_reviewed_by TEXT NOT NULL DEFAULT '',
  compliance_decision TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  wire_id TEXT,
  rejection_reason TEXT NOT NULL DEFAULT '',
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_withdrawals_user_idx ON public.ivx_withdrawals (user_id);
CREATE INDEX IF NOT EXISTS ivx_withdrawals_status_idx ON public.ivx_withdrawals (status);
ALTER TABLE public.ivx_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_withdrawals_owner_select ON public.ivx_withdrawals;
CREATE POLICY ivx_withdrawals_owner_select ON public.ivx_withdrawals
  FOR SELECT USING (public.ivx_is_owner() OR auth.uid() = user_id);
DROP POLICY IF EXISTS ivx_withdrawals_owner_write ON public.ivx_withdrawals;
CREATE POLICY ivx_withdrawals_owner_write ON public.ivx_withdrawals
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_wires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  withdrawal_id TEXT,
  bank_name_encrypted TEXT NOT NULL DEFAULT '',
  account_holder_encrypted TEXT NOT NULL DEFAULT '',
  routing_encrypted TEXT NOT NULL DEFAULT '',
  account_number_encrypted TEXT NOT NULL DEFAULT '',
  swift_encrypted TEXT NOT NULL DEFAULT '',
  iban_encrypted TEXT NOT NULL DEFAULT '',
  -- Last 4 stored in plaintext for display; full values NEVER returned.
  account_number_last4 TEXT NOT NULL DEFAULT '',
  is_international BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','initiated','confirmed','failed','reversed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_wires_user_idx ON public.ivx_wires (user_id);
CREATE INDEX IF NOT EXISTS ivx_wires_status_idx ON public.ivx_wires (status);
ALTER TABLE public.ivx_wires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_wires_owner_select ON public.ivx_wires;
CREATE POLICY ivx_wires_owner_select ON public.ivx_wires
  FOR SELECT USING (public.ivx_is_owner() OR auth.uid() = user_id);
DROP POLICY IF EXISTS ivx_wires_owner_write ON public.ivx_wires;
CREATE POLICY ivx_wires_owner_write ON public.ivx_wires
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  kyc_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (kyc_status IN ('not_started','pending','verified','rejected','expired')),
  kyc_verified_at TIMESTAMPTZ,
  aml_status TEXT NOT NULL DEFAULT 'not_reviewed'
    CHECK (aml_status IN ('not_reviewed','under_review','cleared','flagged')),
  aml_reviewed_by TEXT NOT NULL DEFAULT '',
  accredited_investor_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (accredited_investor_status IN ('unverified','pending','verified','rejected')),
  identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_compliance_kyc_idx ON public.ivx_compliance (kyc_status);
CREATE INDEX IF NOT EXISTS ivx_compliance_aml_idx ON public.ivx_compliance (aml_status);
ALTER TABLE public.ivx_compliance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_compliance_owner_select ON public.ivx_compliance;
CREATE POLICY ivx_compliance_owner_select ON public.ivx_compliance
  FOR SELECT USING (public.ivx_is_owner() OR auth.uid() = user_id);
DROP POLICY IF EXISTS ivx_compliance_owner_write ON public.ivx_compliance;
CREATE POLICY ivx_compliance_owner_write ON public.ivx_compliance
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- Append-only audit log. UPDATE allowed only to append new fields; DELETE denied.
CREATE TABLE IF NOT EXISTS public.ivx_protection_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_admin_id TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  target_user_id TEXT NOT NULL DEFAULT '',
  target_entity TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  old_value JSONB,
  new_value JSONB,
  reason TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_protection_audit_action_idx ON public.ivx_protection_audit_log (action);
CREATE INDEX IF NOT EXISTS ivx_protection_audit_target_idx ON public.ivx_protection_audit_log (target_user_id);
CREATE INDEX IF NOT EXISTS ivx_protection_audit_created_idx ON public.ivx_protection_audit_log (created_at DESC);
-- Audit log is append-only: only INSERT allowed, no UPDATE/DELETE for anyone.
ALTER TABLE public.ivx_protection_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_protection_audit_insert ON public.ivx_protection_audit_log;
CREATE POLICY ivx_protection_audit_insert ON public.ivx_protection_audit_log
  FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS ivx_protection_audit_select ON public.ivx_protection_audit_log;
CREATE POLICY ivx_protection_audit_select ON public.ivx_protection_audit_log
  FOR SELECT USING (public.ivx_is_owner());

CREATE TABLE IF NOT EXISTS public.ivx_protection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ivx_protection_reports_type_idx ON public.ivx_protection_reports (report_type);
ALTER TABLE public.ivx_protection_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ivx_protection_reports_owner_select ON public.ivx_protection_reports;
CREATE POLICY ivx_protection_reports_owner_select ON public.ivx_protection_reports
  FOR SELECT USING (public.ivx_is_owner());
DROP POLICY IF EXISTS ivx_protection_reports_owner_write ON public.ivx_protection_reports;
CREATE POLICY ivx_protection_reports_owner_write ON public.ivx_protection_reports
  FOR ALL USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
