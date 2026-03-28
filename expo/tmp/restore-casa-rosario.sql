-- ============================================================
-- RESTORE CASA ROSARIO DEAL — Run in Supabase SQL Editor
-- ============================================================
-- This script:
-- 1. Adds all missing columns to jv_deals
-- 2. Fixes RLS policies so deals show publicly
-- 3. Inserts the CASA ROSARIO deal
-- ============================================================

-- STEP 1: Add all missing columns (safe — IF NOT EXISTS pattern)
DO $$
BEGIN
  -- Core columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='title') THEN
    ALTER TABLE jv_deals ADD COLUMN title text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='projectName') THEN
    ALTER TABLE jv_deals ADD COLUMN "projectName" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='type') THEN
    ALTER TABLE jv_deals ADD COLUMN type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='status') THEN
    ALTER TABLE jv_deals ADD COLUMN status text DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='published') THEN
    ALTER TABLE jv_deals ADD COLUMN published boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='publishedAt') THEN
    ALTER TABLE jv_deals ADD COLUMN "publishedAt" timestamptz;
  END IF;

  -- Partner columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='partner_name') THEN
    ALTER TABLE jv_deals ADD COLUMN partner_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='partner_email') THEN
    ALTER TABLE jv_deals ADD COLUMN partner_email text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='partner_phone') THEN
    ALTER TABLE jv_deals ADD COLUMN partner_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='partner_type') THEN
    ALTER TABLE jv_deals ADD COLUMN partner_type text;
  END IF;

  -- Property columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='propertyAddress') THEN
    ALTER TABLE jv_deals ADD COLUMN "propertyAddress" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='property_address') THEN
    ALTER TABLE jv_deals ADD COLUMN property_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='city') THEN
    ALTER TABLE jv_deals ADD COLUMN city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='state') THEN
    ALTER TABLE jv_deals ADD COLUMN state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='zip_code') THEN
    ALTER TABLE jv_deals ADD COLUMN zip_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='country') THEN
    ALTER TABLE jv_deals ADD COLUMN country text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='lot_size') THEN
    ALTER TABLE jv_deals ADD COLUMN lot_size numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='lot_size_unit') THEN
    ALTER TABLE jv_deals ADD COLUMN lot_size_unit text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='zoning') THEN
    ALTER TABLE jv_deals ADD COLUMN zoning text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='property_type') THEN
    ALTER TABLE jv_deals ADD COLUMN property_type text;
  END IF;

  -- Financial columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='totalInvestment') THEN
    ALTER TABLE jv_deals ADD COLUMN "totalInvestment" numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='expectedROI') THEN
    ALTER TABLE jv_deals ADD COLUMN "expectedROI" numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='estimated_value') THEN
    ALTER TABLE jv_deals ADD COLUMN estimated_value numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='appraised_value') THEN
    ALTER TABLE jv_deals ADD COLUMN appraised_value numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='cash_payment_percent') THEN
    ALTER TABLE jv_deals ADD COLUMN cash_payment_percent numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='collateral_percent') THEN
    ALTER TABLE jv_deals ADD COLUMN collateral_percent numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='partner_profit_share') THEN
    ALTER TABLE jv_deals ADD COLUMN partner_profit_share numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='developer_profit_share') THEN
    ALTER TABLE jv_deals ADD COLUMN developer_profit_share numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='term_months') THEN
    ALTER TABLE jv_deals ADD COLUMN term_months integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='cash_payment_amount') THEN
    ALTER TABLE jv_deals ADD COLUMN cash_payment_amount numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='collateral_amount') THEN
    ALTER TABLE jv_deals ADD COLUMN collateral_amount numeric;
  END IF;

  -- Deal terms
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='distributionFrequency') THEN
    ALTER TABLE jv_deals ADD COLUMN "distributionFrequency" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='exitStrategy') THEN
    ALTER TABLE jv_deals ADD COLUMN "exitStrategy" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='partners') THEN
    ALTER TABLE jv_deals ADD COLUMN partners jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='poolTiers') THEN
    ALTER TABLE jv_deals ADD COLUMN "poolTiers" jsonb;
  END IF;

  -- Media & docs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='photos') THEN
    ALTER TABLE jv_deals ADD COLUMN photos jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='documents') THEN
    ALTER TABLE jv_deals ADD COLUMN documents jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='notes') THEN
    ALTER TABLE jv_deals ADD COLUMN notes text;
  END IF;

  -- Admin columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='rejection_reason') THEN
    ALTER TABLE jv_deals ADD COLUMN rejection_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='control_disclosure_accepted') THEN
    ALTER TABLE jv_deals ADD COLUMN control_disclosure_accepted boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='control_disclosure_accepted_at') THEN
    ALTER TABLE jv_deals ADD COLUMN control_disclosure_accepted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='payment_structure') THEN
    ALTER TABLE jv_deals ADD COLUMN payment_structure text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='user_id') THEN
    ALTER TABLE jv_deals ADD COLUMN user_id uuid;
  END IF;

  -- Timestamps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='createdAt') THEN
    ALTER TABLE jv_deals ADD COLUMN "createdAt" timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='updatedAt') THEN
    ALTER TABLE jv_deals ADD COLUMN "updatedAt" timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='submitted_at') THEN
    ALTER TABLE jv_deals ADD COLUMN submitted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='approved_at') THEN
    ALTER TABLE jv_deals ADD COLUMN approved_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='completed_at') THEN
    ALTER TABLE jv_deals ADD COLUMN completed_at timestamptz;
  END IF;

  -- Contract columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='currency') THEN
    ALTER TABLE jv_deals ADD COLUMN currency text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='profitSplit') THEN
    ALTER TABLE jv_deals ADD COLUMN "profitSplit" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='startDate') THEN
    ALTER TABLE jv_deals ADD COLUMN "startDate" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='endDate') THEN
    ALTER TABLE jv_deals ADD COLUMN "endDate" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='governingLaw') THEN
    ALTER TABLE jv_deals ADD COLUMN "governingLaw" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='disputeResolution') THEN
    ALTER TABLE jv_deals ADD COLUMN "disputeResolution" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='confidentialityPeriod') THEN
    ALTER TABLE jv_deals ADD COLUMN "confidentialityPeriod" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='nonCompetePeriod') THEN
    ALTER TABLE jv_deals ADD COLUMN "nonCompetePeriod" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='managementFee') THEN
    ALTER TABLE jv_deals ADD COLUMN "managementFee" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='performanceFee') THEN
    ALTER TABLE jv_deals ADD COLUMN "performanceFee" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jv_deals' AND column_name='minimumHoldPeriod') THEN
    ALTER TABLE jv_deals ADD COLUMN "minimumHoldPeriod" text;
  END IF;

  RAISE NOTICE 'All missing columns added successfully';
END $$;

-- STEP 2: Fix RLS policies
ALTER TABLE jv_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jv_deals_select_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_select_scoped ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_scoped ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_scoped ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_admin ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_scoped ON jv_deals;

CREATE POLICY jv_deals_select_scoped ON jv_deals FOR SELECT USING (
  published = true OR is_published = true OR user_id = auth.uid()
);
CREATE POLICY jv_deals_insert_scoped ON jv_deals FOR INSERT WITH CHECK (true);
CREATE POLICY jv_deals_update_scoped ON jv_deals FOR UPDATE USING (true);
CREATE POLICY jv_deals_delete_scoped ON jv_deals FOR DELETE USING (true);

-- STEP 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);
CREATE INDEX IF NOT EXISTS idx_jv_deals_created ON jv_deals("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_jv_deals_user ON jv_deals(user_id);

-- STEP 4: Delete any existing CASA ROSARIO deal (clean slate)
DELETE FROM jv_deals WHERE name = 'CASA ROSARIO';
DELETE FROM jv_deals WHERE UPPER(name) LIKE '%CASA ROSARIO%';

-- STEP 5: Insert CASA ROSARIO deal (id auto-generated as UUID)
INSERT INTO jv_deals (
  name, title, "projectName", type, description,
  partner_name, partner_type,
  "propertyAddress", property_address, city, state, zip_code, country, property_type,
  "totalInvestment", amount, "expectedROI", estimated_value, term_months,
  "distributionFrequency", "exitStrategy",
  status, published, is_published, "publishedAt",
  photos, currency, "profitSplit",
  partners,
  "createdAt", "updatedAt"
)
VALUES (
  'CASA ROSARIO',
  'CASA ROSARIO',
  'ONE STOP DEVELOPMENT TWO LLC',
  'development',
  'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
  'ONE STOP DEVELOPMENT TWO LLC',
  'developer',
  '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
  '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
  'Pembroke Pines',
  'FL',
  '33332',
  'US',
  'Residential',
  1400000,
  1400000,
  30,
  1820000,
  24,
  'Quarterly',
  'Sale upon completion',
  'active',
  true,
  true,
  NOW(),
  '[]'::jsonb,
  'USD',
  '70/30 Developer/Investor',
  '[{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}]'::jsonb,
  NOW(),
  NOW()
);

-- STEP 6: Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_jv_updated_at()
RETURNS trigger AS $f$ BEGIN NEW."updatedAt" = now(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_jv_deals_updated_at ON jv_deals;
CREATE TRIGGER trg_jv_deals_updated_at BEFORE UPDATE ON jv_deals FOR EACH ROW EXECUTE FUNCTION public.set_jv_updated_at();

-- STEP 7: Verify the deal is in the database
SELECT id, name, title, status, published, is_published, "totalInvestment", city, state, "expectedROI"
FROM jv_deals
WHERE name = 'CASA ROSARIO';
