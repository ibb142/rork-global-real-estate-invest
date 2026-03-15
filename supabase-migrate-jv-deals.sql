-- ============================================================
-- MIGRATION: Add missing columns to jv_deals table
-- Then seed Casa Rosario deal
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Step 1: Add all missing columns the landing page + app need
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "projectName" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "propertyAddress" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS property_address text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS property_type text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "totalInvestment" numeric DEFAULT 0;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "expectedROI" numeric DEFAULT 0;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS estimated_value numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "publishedAt" timestamptz;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partners jsonb DEFAULT '[]'::jsonb;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "poolTiers" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "distributionFrequency" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "exitStrategy" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partner_email text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partner_phone text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partner_type text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS lot_size numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS lot_size_unit text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS zoning text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS appraised_value numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS cash_payment_percent numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS collateral_percent numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS partner_profit_share numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS developer_profit_share numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS term_months integer;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS cash_payment_amount numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS collateral_amount numeric;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS control_disclosure_accepted boolean DEFAULT false;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS control_disclosure_accepted_at timestamptz;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS payment_structure text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "profitSplit" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "startDate" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "endDate" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "governingLaw" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "disputeResolution" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "confidentialityPeriod" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "nonCompetePeriod" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "managementFee" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "performanceFee" text;
ALTER TABLE jv_deals ADD COLUMN IF NOT EXISTS "minimumHoldPeriod" text;

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);

-- Step 3: Make sure RLS allows anonymous SELECT for the landing page
DROP POLICY IF EXISTS jv_deals_select_public ON jv_deals;
CREATE POLICY jv_deals_select_public ON jv_deals
  FOR SELECT USING (true);

-- Step 4: Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals;
    RAISE NOTICE 'Realtime ENABLED for jv_deals';
  ELSE
    RAISE NOTICE 'Realtime already enabled for jv_deals';
  END IF;
END $$;

-- Step 5: Seed Casa Rosario deal
INSERT INTO jv_deals (
  id,
  title,
  name,
  "projectName",
  type,
  description,
  partner_name,
  partner_type,
  "propertyAddress",
  property_address,
  city,
  state,
  zip_code,
  country,
  property_type,
  "totalInvestment",
  amount,
  "expectedROI",
  estimated_value,
  term_months,
  "distributionFrequency",
  "exitStrategy",
  status,
  published,
  "publishedAt",
  photos,
  notes,
  "createdAt",
  "updatedAt",
  currency,
  "profitSplit",
  partners
)
VALUES (
  gen_random_uuid(),
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
  NOW(),
  '[
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80",
    "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800&q=80",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80"
  ]'::jsonb,
  'Flagship Casa Rosario development in Pembroke Pines, FL. Premium residential property with strong ROI potential.',
  NOW(),
  NOW(),
  'USD',
  '70/30',
  '[{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}]'::jsonb
);

-- Step 6: Verify
SELECT
  id,
  title,
  name,
  "projectName",
  status,
  published,
  "totalInvestment",
  "expectedROI",
  jsonb_array_length(photos) as photo_count
FROM jv_deals;
