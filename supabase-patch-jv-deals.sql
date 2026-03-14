-- =============================================================================
-- PATCH: Add missing columns to jv_deals + fix RLS
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Safe to run multiple times.
-- =============================================================================

-- 1. Add missing columns (IF NOT EXISTS prevents errors on re-run)
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "projectName" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "totalInvestment" numeric DEFAULT 0;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "expectedROI" numeric DEFAULT 0;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "propertyAddress" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "distributionFrequency" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "exitStrategy" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partners jsonb;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "poolTiers" jsonb;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "publishedAt" timestamptz;

-- 2. Fix RLS policies: allow anon insert/update so seed + landing page work
DROP POLICY IF EXISTS jv_deals_insert_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_all ON jv_deals;

CREATE POLICY jv_deals_insert_all ON jv_deals FOR INSERT WITH CHECK (true);
CREATE POLICY jv_deals_update_all ON jv_deals FOR UPDATE USING (true);

-- 3. All deals are managed via Admin Panel — no hardcoded seeds
-- Create deals through the Admin Panel at /admin/jv-deals

-- 4. Enable Supabase Realtime on jv_deals table
-- This is REQUIRED for real-time sync between Admin Panel and Landing Page.
-- Without this, the realtime subscription connects but NEVER receives change events.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals;
    RAISE NOTICE 'Realtime enabled for jv_deals table';
  ELSE
    RAISE NOTICE 'Realtime already enabled for jv_deals table';
  END IF;
END
$;

-- =============================================================================
-- DONE! Schema patched + Realtime enabled. Create deals via Admin Panel.
-- =============================================================================
