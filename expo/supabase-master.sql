-- =============================================================================
-- IVXHOLDINGS — MASTER SETUP (ALL-IN-ONE)
-- =============================================================================
-- Run this ONCE in Supabase SQL Editor. Creates everything:
--   54+ tables, indexes, triggers, RLS policies, realtime, storage bucket.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).
--
-- MIGRATION LOG:
--   v1.0 (Mar 15, 2026) — Initial schema: 54 tables, RLS, is_admin()
--   v1.1 (Mar 18, 2026) — Added app_config admin roles, DELETE policies, GDPR
--   v1.2 (Mar 20, 2026) — Fixed function ordering (before RLS), increment_sms_counter RPC
--   v1.3 (Mar 22, 2026) — Added update_updated_at_column() trigger for all tables
--   v1.4 (Mar 23, 2026) — Analytics realtime, visitor_sessions, time tracking, image backups
--
-- WARNING: This is a monolithic migration file.
--   For production schema changes, create numbered migration files:
--   e.g., migrations/002_add_column.sql
--   Only modify this file for full re-deployments.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SECTION 1: CORE TABLES (9)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jv_deals (
  id TEXT PRIMARY KEY DEFAULT ('jv-' || uuid_generate_v4()::text),
  title TEXT NOT NULL DEFAULT 'Untitled Deal',
  project_name TEXT, type TEXT DEFAULT 'joint_venture', description TEXT,
  partner_name TEXT, partner_email TEXT, partner_phone TEXT, partner_type TEXT,
  property_address TEXT, city TEXT, state TEXT, zip_code TEXT,
  country TEXT DEFAULT 'Puerto Rico', lot_size NUMERIC, lot_size_unit TEXT DEFAULT 'cuerdas',
  zoning TEXT, property_type TEXT,
  total_investment NUMERIC DEFAULT 0, expected_roi NUMERIC DEFAULT 0,
  estimated_value NUMERIC DEFAULT 0, appraised_value NUMERIC DEFAULT 0,
  cash_payment_percent NUMERIC DEFAULT 0, collateral_percent NUMERIC DEFAULT 0,
  partner_profit_share NUMERIC DEFAULT 0, developer_profit_share NUMERIC DEFAULT 0,
  term_months INTEGER DEFAULT 12, cash_payment_amount NUMERIC DEFAULT 0,
  collateral_amount NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD',
  profit_split TEXT, management_fee NUMERIC DEFAULT 0, performance_fee NUMERIC DEFAULT 0,
  minimum_hold_period INTEGER,
  distribution_frequency TEXT DEFAULT 'quarterly', exit_strategy TEXT,
  start_date TEXT, end_date TEXT, governing_law TEXT DEFAULT 'Puerto Rico',
  dispute_resolution TEXT DEFAULT 'Arbitration', confidentiality_period TEXT,
  non_compete_period TEXT, payment_structure TEXT,
  partners JSONB DEFAULT '[]'::jsonb, pool_tiers JSONB,
  photos JSONB DEFAULT '[]'::jsonb, documents JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft', published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ, notes TEXT, rejection_reason TEXT,
  control_disclosure_accepted BOOLEAN DEFAULT false,
  control_disclosure_accepted_at TIMESTAMPTZ,
  user_id TEXT NOT NULL DEFAULT 'system',
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ, deleted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ, approved_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS landing_deals (
  id TEXT PRIMARY KEY,
  title TEXT, project_name TEXT, description TEXT,
  property_address TEXT, city TEXT, state TEXT, country TEXT,
  total_investment NUMERIC DEFAULT 0, expected_roi NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active', photos JSONB DEFAULT '[]'::jsonb,
  distribution_frequency TEXT, exit_strategy TEXT,
  published_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_trail (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, entity_title TEXT,
  action TEXT NOT NULL, user_id TEXT, user_role TEXT DEFAULT 'unknown',
  timestamp TIMESTAMPTZ DEFAULT now(), details JSONB,
  snapshot_before JSONB, snapshot_after JSONB,
  source TEXT DEFAULT 'app', ip_address TEXT
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY DEFAULT ('wl-' || uuid_generate_v4()::text),
  email TEXT NOT NULL, name TEXT, phone TEXT, deal_id TEXT,
  investment_amount NUMERIC, message TEXT, status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
  country TEXT, avatar TEXT, kyc_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'active', role TEXT DEFAULT 'investor',
  referral_code TEXT,
  total_invested NUMERIC DEFAULT 0, total_returns NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY DEFAULT ('wal-' || uuid_generate_v4()::text),
  user_id TEXT NOT NULL, available NUMERIC DEFAULT 0, pending NUMERIC DEFAULT 0,
  invested NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD',
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY DEFAULT ('hold-' || uuid_generate_v4()::text),
  user_id TEXT NOT NULL, property_id TEXT NOT NULL, shares NUMERIC DEFAULT 0,
  avg_cost_basis NUMERIC DEFAULT 0, current_value NUMERIC DEFAULT 0,
  total_return NUMERIC DEFAULT 0, total_return_percent NUMERIC DEFAULT 0,
  unrealized_pnl NUMERIC DEFAULT 0, unrealized_pnl_percent NUMERIC DEFAULT 0,
  purchase_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY DEFAULT ('txn-' || uuid_generate_v4()::text),
  user_id TEXT NOT NULL, type TEXT NOT NULL, amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending', description TEXT,
  property_id TEXT, property_name TEXT, reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT ('notif-' || uuid_generate_v4()::text),
  user_id TEXT NOT NULL, type TEXT DEFAULT 'info',
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);

-- =============================================================================
-- SECTION 2: ADMIN & ANALYTICS TABLES (14)
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL, properties JSONB, user_id TEXT, session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_dashboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL, value NUMERIC DEFAULT 0, change_percent NUMERIC DEFAULT 0,
  period TEXT, properties JSONB, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_kpi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL, value NUMERIC DEFAULT 0, target NUMERIC DEFAULT 0,
  change_percent NUMERIC DEFAULT 0, period TEXT, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_retention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort TEXT, period TEXT, users_count INTEGER DEFAULT 0,
  retention_rate NUMERIC DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT, value NUMERIC DEFAULT 0, period TEXT,
  properties JSONB, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL, status TEXT DEFAULT 'healthy',
  latency_ms INTEGER DEFAULT 0, error_count INTEGER DEFAULT 0,
  details JSONB, checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metrics JSONB, uptime TEXT, last_full_scan TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT, user_name TEXT, role TEXT, action TEXT, module TEXT,
  details JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT, action TEXT NOT NULL, module TEXT, ip_address TEXT,
  details JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT, name TEXT, source TEXT, campaign TEXT,
  status TEXT DEFAULT 'new', properties JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, name TEXT, email TEXT, phone TEXT,
  status TEXT DEFAULT 'pending', details JSONB,
  reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_brain_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT, status TEXT DEFAULT 'idle', metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_repair_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending', checks JSONB, summary JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repair_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id TEXT, action TEXT, status TEXT DEFAULT 'pending',
  details TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SECTION 3: FEATURE TABLES (20)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ipx_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, token_type TEXT DEFAULT 'IPX',
  balance NUMERIC DEFAULT 0, locked_balance NUMERIC DEFAULT 0,
  total_earned NUMERIC DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ipx_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, amount NUMERIC DEFAULT 0,
  price_per_token NUMERIC DEFAULT 0, total_cost NUMERIC DEFAULT 0,
  payment_method TEXT, status TEXT DEFAULT 'completed',
  purchased_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS earn_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE, total_deposited NUMERIC DEFAULT 0,
  total_earned NUMERIC DEFAULT 0, current_apy NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS earn_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, amount NUMERIC DEFAULT 0, source TEXT,
  status TEXT DEFAULT 'completed', deposited_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS earn_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, amount NUMERIC DEFAULT 0,
  type TEXT DEFAULT 'interest', status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, status TEXT DEFAULT 'pending', level TEXT DEFAULT 'basic',
  first_name TEXT, last_name TEXT, date_of_birth TEXT, address TEXT, country TEXT, id_type TEXT,
  submitted_at TIMESTAMPTZ, verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, verification_id TEXT, type TEXT NOT NULL,
  file_url TEXT, file_name TEXT, status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id TEXT NOT NULL, referred_id TEXT, referred_email TEXT,
  status TEXT DEFAULT 'pending', reward_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id TEXT NOT NULL, email TEXT NOT NULL,
  status TEXT DEFAULT 'sent', created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_reports (
  id TEXT PRIMARY KEY DEFAULT 'default',
  total_sent INTEGER DEFAULT 0, total_delivered INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0, smart_schedule_active BOOLEAN DEFAULT false,
  properties JSONB, status TEXT DEFAULT 'stopped', running BOOLEAN DEFAULT false,
  phone TEXT DEFAULT '+1 561-644-3503', total_simulated INTEGER DEFAULT 0,
  sns_configured BOOLEAN DEFAULT false, last_report TEXT,
  last_report_time TIMESTAMPTZ, smart_schedule_config JSONB,
  recipients JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT, recipient TEXT, content TEXT, status TEXT DEFAULT 'pending',
  recipient_phone TEXT, subject TEXT, details TEXT, message TEXT,
  error TEXT, delivered_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lender_sync_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_synced INTEGER DEFAULT 0, last_sync TIMESTAMPTZ,
  status TEXT DEFAULT 'idle', properties JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lender_sync_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  auto_sync BOOLEAN DEFAULT false, sync_interval INTEGER DEFAULT 24,
  sources JSONB DEFAULT '[]'::jsonb, filters JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, email TEXT, phone TEXT, company TEXT, type TEXT, source TEXT,
  properties JSONB, synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lender_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending', records_processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0, details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS imported_lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, email TEXT, phone TEXT, company TEXT, source TEXT,
  properties JSONB, imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, type TEXT, amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending', details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT, subject TEXT, message TEXT,
  status TEXT DEFAULT 'open', priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS influencer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, email TEXT, platform TEXT, followers INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, platform TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SECTION 4: DATA & MARKETING TABLES (13)
-- =============================================================================

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY DEFAULT ('prop-' || uuid_generate_v4()::text),
  name TEXT, location TEXT, type TEXT, price NUMERIC DEFAULT 0,
  total_shares INTEGER DEFAULT 1000, available_shares INTEGER DEFAULT 1000,
  share_price NUMERIC DEFAULT 0, annual_yield NUMERIC DEFAULT 0,
  occupancy_rate NUMERIC DEFAULT 0, image TEXT, status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_data (
  id TEXT PRIMARY KEY DEFAULT ('mkt-' || uuid_generate_v4()::text),
  metric TEXT NOT NULL, value NUMERIC DEFAULT 0, change_percent NUMERIC DEFAULT 0,
  period TEXT, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  index_name TEXT, value NUMERIC DEFAULT 0, change_percent NUMERIC DEFAULT 0,
  period TEXT, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS image_registry (
  id TEXT PRIMARY KEY, user_id TEXT, deal_id TEXT, url TEXT, storage_path TEXT,
  is_protected BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL, session_id TEXT NOT NULL, properties JSONB,
  geo JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retargeting_dashboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT, value NUMERIC DEFAULT 0, properties JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audience_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, criteria JSONB, size INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT, pixel_id TEXT, status TEXT DEFAULT 'active',
  events_tracked INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS utm_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT, medium TEXT, campaign TEXT,
  visits INTEGER DEFAULT 0, conversions INTEGER DEFAULT 0,
  properties JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT, results_count INTEGER DEFAULT 0, clicked BOOLEAN DEFAULT false,
  properties JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_engagement_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT, user_segment TEXT, status TEXT DEFAULT 'active',
  properties JSONB, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engagement_scoring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT, score NUMERIC DEFAULT 0, factors JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SECTION 5: EMAILS TABLE (AWS SES)
-- =============================================================================

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'admin',
  folder TEXT NOT NULL DEFAULT 'inbox',
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  to_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients JSONB DEFAULT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  email_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  labels JSONB DEFAULT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  ses_message_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SECTION 6: ALL INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);
CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
CREATE INDEX IF NOT EXISTS idx_jv_deals_created_at ON jv_deals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jv_deals_user_id ON jv_deals(user_id);
CREATE INDEX IF NOT EXISTS idx_jv_deals_deleted_at ON jv_deals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_jv_deals_version ON jv_deals(version);
CREATE INDEX IF NOT EXISTS idx_landing_deals_synced ON landing_deals(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_deal ON waitlist(deal_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_last_tx ON wallets(last_transaction_at);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_property ON holdings(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signups_created ON signups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signups_email ON signups(email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_type ON applications(type);
CREATE INDEX IF NOT EXISTS idx_staff_activity_created ON staff_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipx_holdings_user ON ipx_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_ipx_purchases_user ON ipx_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_earn_accounts_user ON earn_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_earn_deposits_user ON earn_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_earn_payouts_user ON earn_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_user ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_type ON sms_messages(type);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_event ON landing_analytics(event);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_session ON landing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_created ON landing_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_scoring_user ON engagement_scoring(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_account_id ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
CREATE INDEX IF NOT EXISTS idx_emails_account_folder ON emails(account_id, folder);
CREATE INDEX IF NOT EXISTS idx_emails_email_date ON emails(email_date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_ses_message_id ON emails(ses_message_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- =============================================================================
-- SECTION 7: TRIGGER FUNCTIONS + TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_jv_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'jv_deals_updated_at') THEN
    CREATE TRIGGER jv_deals_updated_at BEFORE UPDATE ON jv_deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'jv_deals_version_increment') THEN
    CREATE TRIGGER jv_deals_version_increment BEFORE UPDATE ON jv_deals FOR EACH ROW EXECUTE FUNCTION increment_jv_version();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'wallets_updated_at') THEN
    CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'landing_deals_updated_at') THEN
    CREATE TRIGGER landing_deals_updated_at BEFORE UPDATE ON landing_deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_updated_at') THEN
    CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'properties_updated_at') THEN
    CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'holdings_updated_at') THEN
    CREATE TRIGGER holdings_updated_at BEFORE UPDATE ON holdings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transactions_updated_at') THEN
    CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'earn_accounts_updated_at') THEN
    CREATE TRIGGER earn_accounts_updated_at BEFORE UPDATE ON earn_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kyc_verifications_updated_at') THEN
    CREATE TRIGGER kyc_verifications_updated_at BEFORE UPDATE ON kyc_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'support_tickets_updated_at') THEN
    CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'emails_updated_at') THEN
    CREATE TRIGGER emails_updated_at BEFORE UPDATE ON emails FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- =============================================================================
-- SECTION 8: HELPER FUNCTIONS (MUST be before RLS policies)
-- =============================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  allowed_roles jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid()::text;
  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;
  BEGIN
    SELECT (value->'roles') INTO allowed_roles FROM app_config WHERE key = 'admin_roles';
    IF allowed_roles IS NOT NULL THEN
      RETURN allowed_roles ? user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN user_role IN ('owner', 'ceo', 'staff', 'manager', 'analyst');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner_of(row_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid()::text = row_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid()::text;
  RETURN COALESCE(user_role, 'investor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION verify_admin_access()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SECTION 9: SEED app_config (MUST be before RLS enable, so is_admin can read it)
-- =============================================================================

INSERT INTO app_config (key, value)
VALUES (
  'admin_roles',
  '{"roles": ["owner", "ceo", "staff", "manager", "analyst"]}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECTION 10: ENABLE RLS ON ALL TABLES
-- =============================================================================

DO $$
DECLARE
  _tables text[] := ARRAY[
    'jv_deals', 'landing_deals', 'audit_trail', 'waitlist',
    'profiles', 'wallets', 'holdings', 'transactions', 'notifications',
    'analytics_events', 'analytics_dashboard', 'analytics_kpi',
    'analytics_retention', 'analytics_investments',
    'system_health', 'system_metrics', 'staff_activity', 'staff_activity_log',
    'signups', 'applications', 'ai_brain_status',
    'auto_repair_scans', 'repair_logs',
    'ipx_holdings', 'ipx_purchases',
    'earn_accounts', 'earn_deposits', 'earn_payouts',
    'kyc_verifications', 'kyc_documents',
    'referrals', 'referral_invites',
    'sms_reports', 'sms_messages',
    'lender_sync_stats', 'lender_sync_config', 'synced_lenders',
    'lender_sync_jobs', 'imported_lenders',
    'orders', 'support_tickets', 'influencer_applications', 'push_tokens',
    'properties', 'market_data', 'market_index',
    'image_registry', 'app_config', 'landing_analytics',
    'retargeting_dashboard', 'audience_segments', 'ad_pixels',
    'utm_analytics', 'search_discovery', 're_engagement_triggers',
    'engagement_scoring', 'emails'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = _t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _t);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 11: RLS POLICIES
-- =============================================================================

-- PROFILES
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.uid()::text = id OR is_admin());
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (auth.uid()::text = id);
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid()::text = id OR is_admin());
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  USING (auth.uid()::text = id OR is_admin());

-- WALLETS
DROP POLICY IF EXISTS "wallets_select" ON wallets;
CREATE POLICY "wallets_select" ON wallets FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "wallets_insert" ON wallets;
CREATE POLICY "wallets_insert" ON wallets FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "wallets_update" ON wallets;
CREATE POLICY "wallets_update" ON wallets FOR UPDATE
  USING (is_admin());

-- HOLDINGS
DROP POLICY IF EXISTS "holdings_select" ON holdings;
CREATE POLICY "holdings_select" ON holdings FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "holdings_insert" ON holdings;
CREATE POLICY "holdings_insert" ON holdings FOR INSERT
  WITH CHECK (is_admin());
DROP POLICY IF EXISTS "holdings_update" ON holdings;
CREATE POLICY "holdings_update" ON holdings FOR UPDATE
  USING (is_admin());

-- TRANSACTIONS
DROP POLICY IF EXISTS "transactions_select" ON transactions;
CREATE POLICY "transactions_select" ON transactions FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions FOR INSERT
  WITH CHECK (is_admin());
DROP POLICY IF EXISTS "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions FOR UPDATE
  USING (is_admin());

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  WITH CHECK (is_admin());
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  USING (auth.uid()::text = user_id OR is_admin());

-- JV_DEALS
DROP POLICY IF EXISTS "jv_deals_select" ON jv_deals;
CREATE POLICY "jv_deals_select" ON jv_deals FOR SELECT
  USING (published = true OR auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "jv_deals_insert" ON jv_deals;
CREATE POLICY "jv_deals_insert" ON jv_deals FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "jv_deals_update" ON jv_deals;
CREATE POLICY "jv_deals_update" ON jv_deals FOR UPDATE
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "jv_deals_delete" ON jv_deals;
CREATE POLICY "jv_deals_delete" ON jv_deals FOR DELETE
  USING (is_admin());

-- KYC
DROP POLICY IF EXISTS "kyc_verifications_select" ON kyc_verifications;
CREATE POLICY "kyc_verifications_select" ON kyc_verifications FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "kyc_verifications_insert" ON kyc_verifications;
CREATE POLICY "kyc_verifications_insert" ON kyc_verifications FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "kyc_verifications_update" ON kyc_verifications;
CREATE POLICY "kyc_verifications_update" ON kyc_verifications FOR UPDATE
  USING (is_admin());
DROP POLICY IF EXISTS "kyc_documents_select" ON kyc_documents;
CREATE POLICY "kyc_documents_select" ON kyc_documents FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "kyc_documents_insert" ON kyc_documents;
CREATE POLICY "kyc_documents_insert" ON kyc_documents FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "kyc_documents_update" ON kyc_documents;
CREATE POLICY "kyc_documents_update" ON kyc_documents FOR UPDATE
  USING (is_admin());

-- EARN
DROP POLICY IF EXISTS "earn_accounts_select" ON earn_accounts;
CREATE POLICY "earn_accounts_select" ON earn_accounts FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "earn_accounts_insert" ON earn_accounts;
CREATE POLICY "earn_accounts_insert" ON earn_accounts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "earn_accounts_update" ON earn_accounts;
CREATE POLICY "earn_accounts_update" ON earn_accounts FOR UPDATE
  USING (is_admin());
DROP POLICY IF EXISTS "earn_deposits_select" ON earn_deposits;
CREATE POLICY "earn_deposits_select" ON earn_deposits FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "earn_deposits_insert" ON earn_deposits;
CREATE POLICY "earn_deposits_insert" ON earn_deposits FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "earn_payouts_select" ON earn_payouts;
CREATE POLICY "earn_payouts_select" ON earn_payouts FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "earn_payouts_insert" ON earn_payouts;
CREATE POLICY "earn_payouts_insert" ON earn_payouts FOR INSERT
  WITH CHECK (is_admin());

-- IPX
DROP POLICY IF EXISTS "ipx_holdings_select" ON ipx_holdings;
CREATE POLICY "ipx_holdings_select" ON ipx_holdings FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "ipx_holdings_insert" ON ipx_holdings;
CREATE POLICY "ipx_holdings_insert" ON ipx_holdings FOR INSERT
  WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ipx_holdings_update" ON ipx_holdings;
CREATE POLICY "ipx_holdings_update" ON ipx_holdings FOR UPDATE
  USING (is_admin());
DROP POLICY IF EXISTS "ipx_purchases_select" ON ipx_purchases;
CREATE POLICY "ipx_purchases_select" ON ipx_purchases FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "ipx_purchases_insert" ON ipx_purchases;
CREATE POLICY "ipx_purchases_insert" ON ipx_purchases FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());

-- ORDERS
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE
  USING (is_admin());

-- REFERRALS
DROP POLICY IF EXISTS "referrals_select" ON referrals;
CREATE POLICY "referrals_select" ON referrals FOR SELECT
  USING (auth.uid()::text = referrer_id OR is_admin());
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
CREATE POLICY "referrals_insert" ON referrals FOR INSERT
  WITH CHECK (auth.uid()::text = referrer_id OR is_admin());
DROP POLICY IF EXISTS "referral_invites_select" ON referral_invites;
CREATE POLICY "referral_invites_select" ON referral_invites FOR SELECT
  USING (auth.uid()::text = referrer_id OR is_admin());
DROP POLICY IF EXISTS "referral_invites_insert" ON referral_invites;
CREATE POLICY "referral_invites_insert" ON referral_invites FOR INSERT
  WITH CHECK (auth.uid()::text = referrer_id OR is_admin());

-- SUPPORT TICKETS
DROP POLICY IF EXISTS "support_tickets_select" ON support_tickets;
CREATE POLICY "support_tickets_select" ON support_tickets FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "support_tickets_insert" ON support_tickets;
CREATE POLICY "support_tickets_insert" ON support_tickets FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "support_tickets_update" ON support_tickets;
CREATE POLICY "support_tickets_update" ON support_tickets FOR UPDATE
  USING (auth.uid()::text = user_id OR is_admin());

-- PUSH TOKENS
DROP POLICY IF EXISTS "push_tokens_select" ON push_tokens;
CREATE POLICY "push_tokens_select" ON push_tokens FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "push_tokens_insert" ON push_tokens;
CREATE POLICY "push_tokens_insert" ON push_tokens FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "push_tokens_update" ON push_tokens;
CREATE POLICY "push_tokens_update" ON push_tokens FOR UPDATE
  USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "push_tokens_delete" ON push_tokens;
CREATE POLICY "push_tokens_delete" ON push_tokens FOR DELETE
  USING (auth.uid()::text = user_id OR is_admin());

-- LANDING DEALS — public read, admin write
DROP POLICY IF EXISTS "landing_deals_select" ON landing_deals;
CREATE POLICY "landing_deals_select" ON landing_deals FOR SELECT USING (true);
DROP POLICY IF EXISTS "landing_deals_insert" ON landing_deals;
CREATE POLICY "landing_deals_insert" ON landing_deals FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "landing_deals_update" ON landing_deals;
CREATE POLICY "landing_deals_update" ON landing_deals FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "landing_deals_delete" ON landing_deals;
CREATE POLICY "landing_deals_delete" ON landing_deals FOR DELETE USING (is_admin());

-- WAITLIST — public insert, admin read
DROP POLICY IF EXISTS "waitlist_select" ON waitlist;
CREATE POLICY "waitlist_select" ON waitlist FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "waitlist_insert" ON waitlist;
CREATE POLICY "waitlist_insert" ON waitlist FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "waitlist_update" ON waitlist;
CREATE POLICY "waitlist_update" ON waitlist FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "waitlist_delete" ON waitlist;
CREATE POLICY "waitlist_delete" ON waitlist FOR DELETE USING (is_admin());

-- AUDIT TRAIL — admin only + authenticated insert
DROP POLICY IF EXISTS "audit_trail_select" ON audit_trail;
CREATE POLICY "audit_trail_select" ON audit_trail FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "audit_trail_insert" ON audit_trail;
CREATE POLICY "audit_trail_insert" ON audit_trail FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "audit_trail_update" ON audit_trail;
CREATE POLICY "audit_trail_update" ON audit_trail FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "audit_trail_delete" ON audit_trail;
CREATE POLICY "audit_trail_delete" ON audit_trail FOR DELETE USING (is_admin());

-- PROPERTIES — public read, admin write
DROP POLICY IF EXISTS "properties_select" ON properties;
CREATE POLICY "properties_select" ON properties FOR SELECT USING (true);
DROP POLICY IF EXISTS "properties_insert" ON properties;
CREATE POLICY "properties_insert" ON properties FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "properties_update" ON properties;
CREATE POLICY "properties_update" ON properties FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "properties_delete" ON properties;
CREATE POLICY "properties_delete" ON properties FOR DELETE USING (is_admin());

-- MARKET DATA — public read, admin write
DROP POLICY IF EXISTS "market_data_select" ON market_data;
CREATE POLICY "market_data_select" ON market_data FOR SELECT USING (true);
DROP POLICY IF EXISTS "market_data_insert" ON market_data;
CREATE POLICY "market_data_insert" ON market_data FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "market_data_update" ON market_data;
CREATE POLICY "market_data_update" ON market_data FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "market_data_delete" ON market_data;
CREATE POLICY "market_data_delete" ON market_data FOR DELETE USING (is_admin());
DROP POLICY IF EXISTS "market_index_select" ON market_index;
CREATE POLICY "market_index_select" ON market_index FOR SELECT USING (true);
DROP POLICY IF EXISTS "market_index_insert" ON market_index;
CREATE POLICY "market_index_insert" ON market_index FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "market_index_update" ON market_index;
CREATE POLICY "market_index_update" ON market_index FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "market_index_delete" ON market_index;
CREATE POLICY "market_index_delete" ON market_index FOR DELETE USING (is_admin());

-- APP CONFIG — public read, admin write
DROP POLICY IF EXISTS "app_config_select" ON app_config;
CREATE POLICY "app_config_select" ON app_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "app_config_insert" ON app_config;
CREATE POLICY "app_config_insert" ON app_config FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "app_config_update" ON app_config;
CREATE POLICY "app_config_update" ON app_config FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "app_config_delete" ON app_config;
CREATE POLICY "app_config_delete" ON app_config FOR DELETE USING (is_admin());

-- IMAGE REGISTRY
DROP POLICY IF EXISTS "image_registry_select" ON image_registry;
CREATE POLICY "image_registry_select" ON image_registry FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "image_registry_insert" ON image_registry;
CREATE POLICY "image_registry_insert" ON image_registry FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR is_admin());
DROP POLICY IF EXISTS "image_registry_update" ON image_registry;
CREATE POLICY "image_registry_update" ON image_registry FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "image_registry_delete" ON image_registry;
CREATE POLICY "image_registry_delete" ON image_registry FOR DELETE USING (is_admin());

-- EMAILS — admin only
DROP POLICY IF EXISTS "emails_select_all" ON emails;
DROP POLICY IF EXISTS "emails_insert_all" ON emails;
DROP POLICY IF EXISTS "emails_update_all" ON emails;
DROP POLICY IF EXISTS "emails_delete_all" ON emails;
DROP POLICY IF EXISTS "emails_admin_select" ON emails;
CREATE POLICY "emails_admin_select" ON emails FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "emails_admin_insert" ON emails;
CREATE POLICY "emails_admin_insert" ON emails FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "emails_admin_update" ON emails;
CREATE POLICY "emails_admin_update" ON emails FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS "emails_admin_delete" ON emails;
CREATE POLICY "emails_admin_delete" ON emails FOR DELETE USING (is_admin());

-- ADMIN-ONLY TABLES (analytics, system, staff, etc.) — full CRUD
DO $$
DECLARE
  _admin_tables text[] := ARRAY[
    'analytics_events', 'analytics_dashboard', 'analytics_kpi',
    'analytics_retention', 'analytics_investments',
    'system_health', 'system_metrics', 'staff_activity', 'staff_activity_log',
    'signups', 'applications', 'ai_brain_status',
    'auto_repair_scans', 'repair_logs',
    'sms_reports', 'sms_messages',
    'lender_sync_stats', 'lender_sync_config', 'synced_lenders',
    'lender_sync_jobs', 'imported_lenders',
    'influencer_applications',
    'landing_analytics',
    'retargeting_dashboard', 'audience_segments', 'ad_pixels',
    'utm_analytics', 'search_discovery', 're_engagement_triggers',
    'engagement_scoring'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _admin_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = _t AND table_schema = 'public') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _t || '_admin_select', _t);
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (is_admin())', _t || '_admin_select', _t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _t || '_admin_insert', _t);
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (is_admin())', _t || '_admin_insert', _t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _t || '_admin_update', _t);
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (is_admin())', _t || '_admin_update', _t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _t || '_admin_delete', _t);
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (is_admin())', _t || '_admin_delete', _t);
    END IF;
  END LOOP;
END $$;

-- Special: landing_analytics needs public insert for tracking
DROP POLICY IF EXISTS "landing_analytics_admin_insert" ON landing_analytics;
DROP POLICY IF EXISTS "landing_analytics_public_insert" ON landing_analytics;
CREATE POLICY "landing_analytics_public_insert" ON landing_analytics FOR INSERT WITH CHECK (true);

-- Special: synced_lenders needs admin delete (already created above, just ensure)
DROP POLICY IF EXISTS "synced_lenders_admin_delete" ON synced_lenders;
CREATE POLICY "synced_lenders_admin_delete" ON synced_lenders FOR DELETE USING (is_admin());

-- Special: engagement_scoring users can see their own score
DROP POLICY IF EXISTS "engagement_scoring_admin_select" ON engagement_scoring;
DROP POLICY IF EXISTS "engagement_scoring_user_select" ON engagement_scoring;
CREATE POLICY "engagement_scoring_user_select" ON engagement_scoring FOR SELECT
  USING (auth.uid()::text = user_id OR is_admin());

-- Special: influencer_applications public insert
DROP POLICY IF EXISTS "influencer_applications_admin_insert" ON influencer_applications;
DROP POLICY IF EXISTS "influencer_applications_public_insert" ON influencer_applications;
CREATE POLICY "influencer_applications_public_insert" ON influencer_applications FOR INSERT WITH CHECK (true);

-- Special: applications public insert (for agent/broker apply)
DROP POLICY IF EXISTS "applications_admin_insert" ON applications;
DROP POLICY IF EXISTS "applications_public_insert" ON applications;
CREATE POLICY "applications_public_insert" ON applications FOR INSERT WITH CHECK (true);

-- Special: signups public insert
DROP POLICY IF EXISTS "signups_admin_insert" ON signups;
DROP POLICY IF EXISTS "signups_public_insert" ON signups;
CREATE POLICY "signups_public_insert" ON signups FOR INSERT WITH CHECK (true);

-- =============================================================================
-- SECTION 12: REALTIME + STORAGE
-- =============================================================================

DO $$
DECLARE
  _rt_tables text[] := ARRAY['jv_deals', 'landing_deals', 'waitlist', 'notifications', 'transactions'];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _rt_tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', _t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('deal-photos', 'deal-photos', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'];

DROP POLICY IF EXISTS "deal_photos_select" ON storage.objects;
CREATE POLICY "deal_photos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'deal-photos');
DROP POLICY IF EXISTS "deal_photos_insert" ON storage.objects;
CREATE POLICY "deal_photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'deal-photos');
DROP POLICY IF EXISTS "deal_photos_update" ON storage.objects;
CREATE POLICY "deal_photos_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'deal-photos');
DROP POLICY IF EXISTS "deal_photos_delete" ON storage.objects;
CREATE POLICY "deal_photos_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'deal-photos' AND is_admin());

CREATE OR REPLACE FUNCTION ensure_deal_photos_bucket()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  bucket_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'deal-photos') INTO bucket_exists;
  IF bucket_exists THEN
    UPDATE storage.buckets SET public = true, file_size_limit = 52428800,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
    WHERE id = 'deal-photos';
    RETURN jsonb_build_object('success', true, 'created', false, 'message', 'Bucket exists');
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('deal-photos', 'deal-photos', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']);
    RETURN jsonb_build_object('success', true, 'created', true, 'message', 'Bucket created');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$;

GRANT EXECUTE ON FUNCTION ensure_deal_photos_bucket() TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_deal_photos_bucket() TO anon;

-- =============================================================================
-- SECTION 13: SEED DEFAULT DATA
-- =============================================================================

INSERT INTO sms_reports (id, status, running, phone, recipients)
VALUES (
  'default', 'stopped', false, '+1 561-644-3503',
  '[{"name": "Kimberly Perez", "phone": "+15616443503", "role": "owner", "active": true, "alertTypes": ["hourly", "emergency", "daily_summary", "smart_update", "manual"]}, {"name": "Sharon", "phone": "+15616443503", "role": "advertising_manager", "active": true, "alertTypes": ["hourly", "emergency", "daily_summary", "smart_update", "manual"]}]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  recipients = COALESCE(sms_reports.recipients, EXCLUDED.recipients),
  phone = COALESCE(sms_reports.phone, EXCLUDED.phone);

INSERT INTO jv_deals (
  id, title, project_name, type, description,
  partner_name, partner_type,
  property_address, city, state, zip_code, country, property_type,
  total_investment, expected_roi, estimated_value, term_months,
  distribution_frequency, exit_strategy,
  status, published, published_at,
  photos, currency, profit_split, partners, user_id
)
VALUES (
  'casa-rosario-001', 'CASA ROSARIO', 'ONE STOP DEVELOPMENT TWO LLC', 'development',
  'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
  'ONE STOP DEVELOPMENT TWO LLC', 'developer',
  '20231 Sw 51st Ct, Pembroke Pines, FL 33332', 'Pembroke Pines', 'FL', '33332', 'US', 'Residential',
  1400000, 30, 1820000, 24, 'Quarterly', 'Sale upon completion',
  'active', true, NOW(), '[]'::jsonb, 'USD', '70/30 Developer/Investor',
  '[{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}]'::jsonb,
  'system'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, project_name = EXCLUDED.project_name,
  total_investment = EXCLUDED.total_investment, expected_roi = EXCLUDED.expected_roi,
  status = EXCLUDED.status, published = EXCLUDED.published,
  published_at = EXCLUDED.published_at, updated_at = now();

INSERT INTO landing_deals (id, title, project_name, description, property_address, city, state, country, total_investment, expected_roi, status, photos, distribution_frequency, exit_strategy, published_at)
VALUES (
  'casa-rosario-001', 'CASA ROSARIO', 'ONE STOP DEVELOPMENT TWO LLC',
  'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI.',
  '20231 Sw 51st Ct, Pembroke Pines, FL 33332', 'Pembroke Pines', 'FL', 'US',
  1400000, 30, 'active', '[]'::jsonb, 'Quarterly', 'Sale upon completion', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, total_investment = EXCLUDED.total_investment,
  status = EXCLUDED.status, updated_at = now();

-- =============================================================================
-- SECTION: auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

DO $
DECLARE
  _tbl TEXT;
BEGIN
  FOR _tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
    GROUP BY table_name
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      _tbl, _tbl
    );
  END LOOP;
END;
$;

-- =============================================================================
-- SECTION: increment_sms_counter RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_sms_counter(counter_name TEXT)
RETURNS VOID AS $
DECLARE
  _now TIMESTAMPTZ := now();
BEGIN
  INSERT INTO sms_reports (id, total_sent, last_report_time, updated_at)
  VALUES ('default', 1, _now, _now)
  ON CONFLICT (id) DO UPDATE SET
    total_sent = sms_reports.total_sent + 1,
    last_report_time = _now,
    updated_at = _now;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SECTION: Image Backup Protection Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS image_backups (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'general',
  entity_id TEXT,
  primary_url TEXT NOT NULL,
  backup_urls JSONB DEFAULT '[]'::jsonb,
  local_uri TEXT,
  supabase_storage_path TEXT,
  last_verified_at TIMESTAMPTZ,
  last_health_status TEXT DEFAULT 'unknown',
  fail_count INTEGER DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  recovery_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_backups_user ON image_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_image_backups_entity ON image_backups(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_image_backups_health ON image_backups(last_health_status);

ALTER TABLE image_backups ENABLE ROW LEVEL SECURITY;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_backups' AND policyname = 'image_backups_select') THEN
    CREATE POLICY image_backups_select ON image_backups FOR SELECT USING (auth.uid() = user_id OR is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_backups' AND policyname = 'image_backups_insert') THEN
    CREATE POLICY image_backups_insert ON image_backups FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_backups' AND policyname = 'image_backups_update') THEN
    CREATE POLICY image_backups_update ON image_backups FOR UPDATE USING (auth.uid() = user_id OR is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_backups' AND policyname = 'image_backups_delete') THEN
    CREATE POLICY image_backups_delete ON image_backups FOR DELETE USING (is_admin());
  END IF;
END $;

CREATE TABLE IF NOT EXISTS image_health_reports (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  total_images INTEGER DEFAULT 0,
  healthy_count INTEGER DEFAULT 0,
  degraded_count INTEGER DEFAULT 0,
  broken_count INTEGER DEFAULT 0,
  recovered_count INTEGER DEFAULT 0,
  failed_recovery_count INTEGER DEFAULT 0,
  scan_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_health_reports_user ON image_health_reports(user_id);

ALTER TABLE image_health_reports ENABLE ROW LEVEL SECURITY;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_health_reports' AND policyname = 'image_health_reports_select') THEN
    CREATE POLICY image_health_reports_select ON image_health_reports FOR SELECT USING (auth.uid() = user_id OR is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_health_reports' AND policyname = 'image_health_reports_insert') THEN
    CREATE POLICY image_health_reports_insert ON image_health_reports FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
  END IF;
END $;

-- =============================================================================
-- DONE! Copy-paste this entire file into Supabase SQL Editor and click RUN.
-- =============================================================================
