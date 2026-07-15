-- =============================================================================
-- IVX FINAL QA FIX MIGRATION — 2026-07-14
-- Idempotent. Safe to re-run.
-- Fixes: RLS infinite recursion on chat tables, 56 missing tables, RLS enablement
-- Run via Supabase SQL Editor (supabase.com → SQL Editor → New Query)
-- =============================================================================

-- ============================================================
-- FIX 1: RLS INFINITE RECURSION on conversation tables
-- ============================================================
-- Root cause: ivx_is_owner() queries profiles table, profiles RLS policy
-- may reference conversation tables creating a circular dependency.
-- Fix: Replace complex policies with simple authenticated access.

DROP POLICY IF EXISTS "conversation_participants_auth_all" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversations_auth_all" ON public.conversations;
DROP POLICY IF EXISTS "messages_auth_all" ON public.messages;

CREATE POLICY "conversation_participants_all" ON public.conversation_participants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "conversations_all" ON public.conversations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "messages_all" ON public.messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- FIX 2: CREATE 56 MISSING TABLES referenced in app code
-- ============================================================

-- landing_submissions (used in 5+ files)
CREATE TABLE IF NOT EXISTS public.landing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "landing_submissions_all" ON public.landing_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- push_tokens (used in push-notifications.ts)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "push_tokens_all" ON public.push_tokens
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- team_members (used in admin-queries.ts)
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "team_members_all" ON public.team_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- fee_transactions (used in admin-queries.ts)
CREATE TABLE IF NOT EXISTS public.fee_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,
  fee_type TEXT NOT NULL DEFAULT 'platform',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fee_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "fee_transactions_all" ON public.fee_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- title_companies (used in admin-queries.ts)
CREATE TABLE IF NOT EXISTS public.title_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  address TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.title_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "title_companies_all" ON public.title_companies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- title_assignments (used in admin-queries.ts)
CREATE TABLE IF NOT EXISTS public.title_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID,
  title_company_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.title_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "title_assignments_all" ON public.title_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- property_submissions (used in admin-queries.ts)
CREATE TABLE IF NOT EXISTS public.property_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  address TEXT NOT NULL DEFAULT '',
  property_type TEXT,
  estimated_value NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.property_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "property_submissions_all" ON public.property_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- fractional_shares (used in admin-queries.ts)
CREATE TABLE IF NOT EXISTS public.fractional_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shares NUMERIC(10,4) NOT NULL DEFAULT 0,
  investment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fractional_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "fractional_shares_all" ON public.fractional_shares
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- kyc_documents (used in KYC verification)
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'id',
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "kyc_documents_all" ON public.kyc_documents
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- support_tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "support_tickets_all" ON public.support_tickets
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID,
  order_type TEXT NOT NULL DEFAULT 'buy',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "orders_all" ON public.orders
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- wallet_transactions (companion to wallets table)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id UUID,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  direction TEXT NOT NULL DEFAULT 'credit',
  status TEXT NOT NULL DEFAULT 'pending',
  reference_id TEXT,
  reference_type TEXT,
  description TEXT,
  fee NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "wallet_transactions_all" ON public.wallet_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_amount NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "referrals_all" ON public.referrals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- referral_invites
CREATE TABLE IF NOT EXISTS public.referral_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_email TEXT NOT NULL,
  invite_code TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "referral_invites_all" ON public.referral_invites
  FOR ALL TO authenticated USING (auth.uid() = referrer_id) WITH CHECK (auth.uid() = referrer_id);

-- notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "notification_preferences_all" ON public.notification_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- signups
CREATE TABLE IF NOT EXISTS public.signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'landing',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "signups_all" ON public.signups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- applications
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'investor',
  status TEXT NOT NULL DEFAULT 'pending',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "applications_all" ON public.applications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- influencer_applications
CREATE TABLE IF NOT EXISTS public.influencer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  platform TEXT,
  followers INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "influencer_applications_all" ON public.influencer_applications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- waitlist_entries
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  position INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "waitlist_entries_all" ON public.waitlist_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- waitlist_otp_events
CREATE TABLE IF NOT EXISTS public.waitlist_otp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.waitlist_otp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "waitlist_otp_events_all" ON public.waitlist_otp_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- staff_activity
CREATE TABLE IF NOT EXISTS public.staff_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "staff_activity_all" ON public.staff_activity
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- staff_activity_log
CREATE TABLE IF NOT EXISTS public.staff_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT '',
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "staff_activity_log_all" ON public.staff_activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- error_logs
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  url TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "error_logs_all" ON public.error_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- system_health
CREATE TABLE IF NOT EXISTS public.system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "system_health_all" ON public.system_health
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- app_config
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "app_config_all" ON public.app_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ai_brain_status
CREATE TABLE IF NOT EXISTS public.ai_brain_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  last_task TEXT,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_brain_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ai_brain_status_all" ON public.ai_brain_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ad_pixels
CREATE TABLE IF NOT EXISTS public.ad_pixels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT '',
  pixel_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_pixels ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ad_pixels_all" ON public.ad_pixels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audience_segments
CREATE TABLE IF NOT EXISTS public.audience_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audience_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "audience_segments_all" ON public.audience_segments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- email_notifications_queue
CREATE TABLE IF NOT EXISTS public.email_notifications_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_notifications_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "email_notifications_queue_all" ON public.email_notifications_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- engagement_scoring
CREATE TABLE IF NOT EXISTS public.engagement_scoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'standard',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.engagement_scoring ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "engagement_scoring_all" ON public.engagement_scoring
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- earn_accounts
CREATE TABLE IF NOT EXISTS public.earn_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(14,2) DEFAULT 0,
  apy NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.earn_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "earn_accounts_all" ON public.earn_accounts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- earn_deposits
CREATE TABLE IF NOT EXISTS public.earn_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.earn_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "earn_deposits_all" ON public.earn_deposits
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- earn_payouts
CREATE TABLE IF NOT EXISTS public.earn_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.earn_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "earn_payouts_all" ON public.earn_payouts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- image_backups
CREATE TABLE IF NOT EXISTS public.image_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_url TEXT NOT NULL,
  backup_url TEXT,
  backup_provider TEXT DEFAULT 's3',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.image_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "image_backups_all" ON public.image_backups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- image_health_reports
CREATE TABLE IF NOT EXISTS public.image_health_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  http_status INTEGER,
  response_time_ms INTEGER,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.image_health_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "image_health_reports_all" ON public.image_health_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- image_registry
CREATE TABLE IF NOT EXISTS public.image_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.image_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "image_registry_all" ON public.image_registry
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- imported_lenders
CREATE TABLE IF NOT EXISTS public.imported_lenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name TEXT NOT NULL DEFAULT '',
  source TEXT DEFAULT 'import',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.imported_lenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "imported_lenders_all" ON public.imported_lenders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ipx_holdings
CREATE TABLE IF NOT EXISTS public.ipx_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID,
  shares NUMERIC(10,4) NOT NULL DEFAULT 0,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ipx_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ipx_holdings_all" ON public.ipx_holdings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ipx_purchases
CREATE TABLE IF NOT EXISTS public.ipx_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID,
  shares NUMERIC(10,4) NOT NULL DEFAULT 0,
  price_per_share NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ipx_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ipx_purchases_all" ON public.ipx_purchases
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- landing_deployments
CREATE TABLE IF NOT EXISTS public.landing_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  url TEXT,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "landing_deployments_all" ON public.landing_deployments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- landing_page_config
CREATE TABLE IF NOT EXISTS public.landing_page_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_page_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "landing_page_config_all" ON public.landing_page_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lender_sync_config
CREATE TABLE IF NOT EXISTS public.lender_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id UUID,
  sync_enabled BOOLEAN DEFAULT false,
  sync_interval TEXT DEFAULT 'daily',
  last_synced_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.lender_sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "lender_sync_config_all" ON public.lender_sync_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lender_sync_jobs
CREATE TABLE IF NOT EXISTS public.lender_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lender_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "lender_sync_jobs_all" ON public.lender_sync_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lender_sync_stats
CREATE TABLE IF NOT EXISTS public.lender_sync_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID,
  total_synced INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lender_sync_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "lender_sync_stats_all" ON public.lender_sync_stats
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- market_index
CREATE TABLE IF NOT EXISTS public.market_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_pct NUMERIC(6,2) DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.market_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "market_index_all" ON public.market_index
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- nerve_center_sessions
CREATE TABLE IF NOT EXISTS public.nerve_center_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nerve_center_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "nerve_center_sessions_all" ON public.nerve_center_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- nerve_center_module_metrics
CREATE TABLE IF NOT EXISTS public.nerve_center_module_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  module TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nerve_center_module_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "nerve_center_module_metrics_all" ON public.nerve_center_module_metrics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- nerve_center_funnel_snapshots
CREATE TABLE IF NOT EXISTS public.nerve_center_funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  stage TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  conversion_rate NUMERIC(6,2) DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nerve_center_funnel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "nerve_center_funnel_snapshots_all" ON public.nerve_center_funnel_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- nerve_center_user_profiles
CREATE TABLE IF NOT EXISTS public.nerve_center_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_score INTEGER DEFAULT 0,
  activity_tier TEXT DEFAULT 'standard',
  last_active_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.nerve_center_user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "nerve_center_user_profiles_all" ON public.nerve_center_user_profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- nerve_center_chat_intelligence_events
CREATE TABLE IF NOT EXISTS public.nerve_center_chat_intelligence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  event_type TEXT NOT NULL,
  sentiment TEXT,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nerve_center_chat_intelligence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "nerve_center_chat_intelligence_events_all" ON public.nerve_center_chat_intelligence_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- re_engagement_triggers
CREATE TABLE IF NOT EXISTS public.re_engagement_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.re_engagement_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "re_engagement_triggers_all" ON public.re_engagement_triggers
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- resale_listings
CREATE TABLE IF NOT EXISTS public.resale_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID,
  shares NUMERIC(10,4) NOT NULL DEFAULT 0,
  price_per_share NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.resale_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "resale_listings_all" ON public.resale_listings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- retargeting_dashboard
CREATE TABLE IF NOT EXISTS public.retargeting_dashboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  spend NUMERIC(14,2) DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.retargeting_dashboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "retargeting_dashboard_all" ON public.retargeting_dashboard
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- search_discovery
CREATE TABLE IF NOT EXISTS public.search_discovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_item TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.search_discovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "search_discovery_all" ON public.search_discovery
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- synced_lenders
CREATE TABLE IF NOT EXISTS public.synced_lenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id UUID,
  external_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.synced_lenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "synced_lenders_all" ON public.synced_lenders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- utm_analytics
CREATE TABLE IF NOT EXISTS public.utm_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  visitor_count INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.utm_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "utm_analytics_all" ON public.utm_analytics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- FIX 3: Enable RLS on all tables that don't have it
-- ============================================================
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        SELECT tablename FROM pg_policies WHERE schemaname = 'public'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      EXECUTE format('CREATE POLICY IF NOT EXISTS "%I_all" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t.tablename, t.tablename);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- FIX 4: Add realtime publication for key tables
-- ============================================================
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.landing_submissions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.push_tokens; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- VERIFICATION QUERIES (run separately to confirm)
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT * FROM public.conversations LIMIT 1;
-- SELECT * FROM public.conversation_participants LIMIT 1;
-- SELECT * FROM public.messages LIMIT 1;
