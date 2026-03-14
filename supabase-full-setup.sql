-- =============================================================================
-- IVXHOLDINGS — COMPLETE SUPABASE SETUP (One-Click)
-- =============================================================================
-- Run this ENTIRE script in Supabase SQL Editor:
--   Dashboard > SQL Editor > New Query > Paste this > Click "Run"
-- Safe to run multiple times (uses IF NOT EXISTS).
-- Creates jv_deals + landing_analytics + waitlist tables,
-- fixes RLS, adds patch columns, and enables Realtime.
-- =============================================================================

-- ============================================================
-- 1. JV_DEALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS jv_deals (
  id text PRIMARY KEY,
  title text,
  "projectName" text,
  type text,
  description text,
  partner_name text,
  partner_email text,
  partner_phone text,
  partner_type text,
  "propertyAddress" text,
  property_address text,
  city text,
  state text,
  zip_code text,
  country text,
  lot_size numeric,
  lot_size_unit text,
  zoning text,
  property_type text,
  "totalInvestment" numeric DEFAULT 0,
  "expectedROI" numeric DEFAULT 0,
  estimated_value numeric,
  appraised_value numeric,
  cash_payment_percent numeric,
  collateral_percent numeric,
  partner_profit_share numeric,
  developer_profit_share numeric,
  term_months integer,
  cash_payment_amount numeric,
  collateral_amount numeric,
  "distributionFrequency" text,
  "exitStrategy" text,
  partners jsonb,
  "poolTiers" jsonb,
  status text DEFAULT 'draft',
  published boolean DEFAULT false,
  "publishedAt" timestamptz,
  photos jsonb DEFAULT '[]'::jsonb,
  documents jsonb DEFAULT '[]'::jsonb,
  notes text,
  rejection_reason text,
  control_disclosure_accepted boolean DEFAULT false,
  control_disclosure_accepted_at timestamptz,
  payment_structure text,
  user_id uuid,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  currency text,
  "profitSplit" text,
  "startDate" text,
  "endDate" text,
  "governingLaw" text,
  "disputeResolution" text,
  "confidentialityPeriod" text,
  "nonCompetePeriod" text,
  "managementFee" text,
  "performanceFee" text,
  "minimumHoldPeriod" text
);

ALTER TABLE jv_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jv_deals_select_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_auth ON jv_deals;

CREATE POLICY jv_deals_select_all ON jv_deals FOR SELECT USING (true);
CREATE POLICY jv_deals_insert_all ON jv_deals FOR INSERT WITH CHECK (true);
CREATE POLICY jv_deals_update_all ON jv_deals FOR UPDATE USING (true);
CREATE POLICY jv_deals_delete_auth ON jv_deals FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);
CREATE INDEX IF NOT EXISTS idx_jv_deals_created ON jv_deals("createdAt" DESC);

-- ============================================================
-- 2. LANDING_ANALYTICS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  session_id text NOT NULL,
  properties jsonb,
  geo jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE landing_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_analytics_select_all ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_insert_all ON landing_analytics;

CREATE POLICY landing_analytics_select_all ON landing_analytics FOR SELECT USING (true);
CREATE POLICY landing_analytics_insert_all ON landing_analytics FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_landing_analytics_event ON landing_analytics(event);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_session ON landing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_created ON landing_analytics(created_at DESC);

-- ============================================================
-- 3. WAITLIST TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  phone text,
  goal text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_select_all ON waitlist;
DROP POLICY IF EXISTS waitlist_insert_all ON waitlist;

CREATE POLICY waitlist_select_all ON waitlist FOR SELECT USING (true);
CREATE POLICY waitlist_insert_all ON waitlist FOR INSERT WITH CHECK (true);

-- ============================================================
-- 4. ENABLE SUPABASE REALTIME ON jv_deals
-- ============================================================
-- This is REQUIRED for real-time sync between Admin Panel and Landing Page.
-- Without this, the realtime subscription connects but NEVER receives events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals;
    RAISE NOTICE '✅ Realtime ENABLED for jv_deals table';
  ELSE
    RAISE NOTICE '✅ Realtime already enabled for jv_deals table';
  END IF;
END
$$;

-- ============================================================
-- 5. VERIFY SETUP
-- ============================================================
DO $$
DECLARE
  _table_exists boolean;
  _realtime_enabled boolean;
  _policy_count integer;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'jv_deals' AND table_schema = 'public') INTO _table_exists;
  SELECT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals') INTO _realtime_enabled;
  SELECT COUNT(*) FROM pg_policies WHERE tablename = 'jv_deals' INTO _policy_count;

  RAISE NOTICE '';
  RAISE NOTICE '=== IVXHOLDINGS SETUP VERIFICATION ===';
  RAISE NOTICE 'jv_deals table exists:    %', CASE WHEN _table_exists THEN '✅ YES' ELSE '❌ NO' END;
  RAISE NOTICE 'Realtime enabled:         %', CASE WHEN _realtime_enabled THEN '✅ YES' ELSE '❌ NO' END;
  RAISE NOTICE 'RLS policies count:       % (expected 4)', _policy_count;
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Setup complete! Your app should now sync in real-time.';
END
$$;

-- =============================================================================
-- DONE! Tables created + Realtime enabled.
-- Create deals via Admin Panel. They will appear on Landing Page in real-time.
-- =============================================================================
