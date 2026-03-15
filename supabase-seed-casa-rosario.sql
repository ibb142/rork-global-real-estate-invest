-- ============================================================
-- SEED: Insert Casa Rosario deal into jv_deals table
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- This bypasses RLS since it runs as service role.
-- ============================================================

INSERT INTO jv_deals (
  id,
  title,
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
  'casa-rosario-001',
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
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  "projectName" = EXCLUDED."projectName",
  description = EXCLUDED.description,
  "totalInvestment" = EXCLUDED."totalInvestment",
  "expectedROI" = EXCLUDED."expectedROI",
  status = EXCLUDED.status,
  published = EXCLUDED.published,
  "publishedAt" = EXCLUDED."publishedAt",
  photos = EXCLUDED.photos,
  "updatedAt" = NOW();

-- Verify the insert
SELECT id, title, "projectName", status, published, "totalInvestment", "expectedROI"
FROM jv_deals
WHERE id = 'casa-rosario-001';
