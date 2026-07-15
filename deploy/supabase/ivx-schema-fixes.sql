-- =============================================================================
-- IVX Schema Fixes — idempotent migration
-- Fixes: missing columns/tables causing 500 errors in production
-- Run via Supabase SQL Editor or owner-action endpoint
-- =============================================================================

-- 1. Add is_featured column to properties table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'is_featured'
  ) THEN
    ALTER TABLE public.properties ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS properties_is_featured_idx ON public.properties (is_featured) WHERE is_featured = TRUE;
  END IF;
END $$;

-- 2. Create deal_tracking table
CREATE TABLE IF NOT EXISTS public.deal_tracking (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT,
  deal_type       TEXT NOT NULL DEFAULT 'jv' CHECK (deal_type IN ('jv', 'acquisition', 'development', 'other')),
  status          TEXT NOT NULL DEFAULT 'prospecting' CHECK (status IN ('prospecting', 'negotiation', 'due_diligence', 'closed', 'dead')),
  property_id     UUID,
  investor_id     UUID,
  deal_value      NUMERIC(14,2),
  equity_split    NUMERIC(5,2),
  expected_roi    NUMERIC(5,2),
  closing_date    DATE,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_tracking_status_idx ON public.deal_tracking (status, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_tracking_property_idx ON public.deal_tracking (property_id);
CREATE INDEX IF NOT EXISTS deal_tracking_investor_idx ON public.deal_tracking (investor_id);

ALTER TABLE public.deal_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_tracking_owner_select ON public.deal_tracking;
CREATE POLICY deal_tracking_owner_select
  ON public.deal_tracking FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS deal_tracking_owner_write ON public.deal_tracking;
CREATE POLICY deal_tracking_owner_write
  ON public.deal_tracking FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- 3. Ensure project_media CHECK constraint allows 'instagram_card'
DO $$
BEGIN
  ALTER TABLE public.project_media DROP CONSTRAINT IF EXISTS project_media_media_type_check;
  ALTER TABLE public.project_media ADD CONSTRAINT project_media_media_type_check
    CHECK (media_type IN ('image', 'video', 'instagram_card'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
