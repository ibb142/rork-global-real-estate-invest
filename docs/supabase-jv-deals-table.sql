-- ============================================================
-- jv_deals table for Supabase
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jv_deals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  "projectName" text DEFAULT '',
  status text DEFAULT 'active',
  type text DEFAULT 'equity_split',
  "totalInvestment" numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  partners jsonb DEFAULT '[]'::jsonb,
  "profitSplit" jsonb DEFAULT '[]'::jsonb,
  "poolTiers" jsonb DEFAULT '[]'::jsonb,
  "startDate" text DEFAULT '',
  "endDate" text DEFAULT '',
  "propertyAddress" text,
  "expectedROI" numeric DEFAULT 0,
  "distributionFrequency" text DEFAULT 'quarterly',
  "exitStrategy" text DEFAULT '',
  "governingLaw" text DEFAULT '',
  "disputeResolution" text DEFAULT '',
  "confidentialityPeriod" integer DEFAULT 60,
  "nonCompetePeriod" integer DEFAULT 24,
  "managementFee" numeric DEFAULT 2,
  "performanceFee" numeric DEFAULT 20,
  "minimumHoldPeriod" integer DEFAULT 12,
  description text DEFAULT '',
  photos jsonb DEFAULT '[]'::jsonb,
  published boolean DEFAULT false,
  "publishedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  "createdBy" text
);

ALTER TABLE public.jv_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on published jv_deals"
  ON public.jv_deals
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on jv_deals"
  ON public.jv_deals
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on jv_deals"
  ON public.jv_deals
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on jv_deals"
  ON public.jv_deals
  FOR DELETE
  USING (true);
