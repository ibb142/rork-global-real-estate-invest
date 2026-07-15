-- =============================================================================
-- AI Project Dashboard — Supabase migration
-- Idempotent. Safe to re-run.
--
-- Creates public.ai_project_dashboard_metrics (owner-read via RLS) plus an
-- index, RLS policies, and verifiable seed data.
--
-- Apply with:
--   psql "$SUPABASE_DB_URL" -f expo/deploy/supabase/ai-project-dashboard.sql
-- or via Supabase Dashboard → SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_project_dashboard_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_area      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('live', 'in_progress', 'planned')),
  open_items        INTEGER NOT NULL DEFAULT 0 CHECK (open_items >= 0),
  completed_items   INTEGER NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feature_area)
);

CREATE INDEX IF NOT EXISTS ai_project_dashboard_metrics_status_idx
  ON public.ai_project_dashboard_metrics (status);

-- Keep updated_at fresh on UPDATE (reuses the platform trigger fn).
DROP TRIGGER IF EXISTS ai_project_dashboard_metrics_touch_updated_at
  ON public.ai_project_dashboard_metrics;
CREATE TRIGGER ai_project_dashboard_metrics_touch_updated_at
  BEFORE UPDATE ON public.ai_project_dashboard_metrics
  FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security: owner-only read; service_role bypasses RLS for writes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_project_dashboard_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_project_dashboard_metrics_owner_select
  ON public.ai_project_dashboard_metrics;
CREATE POLICY ai_project_dashboard_metrics_owner_select
  ON public.ai_project_dashboard_metrics FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS ai_project_dashboard_metrics_owner_write
  ON public.ai_project_dashboard_metrics;
CREATE POLICY ai_project_dashboard_metrics_owner_write
  ON public.ai_project_dashboard_metrics FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- -----------------------------------------------------------------------------
-- Seed data (idempotent upsert — matches the backend FEATURE_AREAS map).
-- -----------------------------------------------------------------------------
INSERT INTO public.ai_project_dashboard_metrics (feature_area, status, open_items, completed_items)
VALUES
  ('Owner AI Assistant',          'live',        2, 18),
  ('Autonomous Senior-Dev Core',  'live',        3, 14),
  ('Persistent Audit Engine',     'live',        1,  9),
  ('Multimodal Uploads & Analysis','in_progress',4,  6),
  ('Render Deploy Pipeline',      'live',        1,  7),
  ('Provider Independence',       'in_progress', 5,  3),
  ('AI Project Dashboard',        'live',        0,  4)
ON CONFLICT (feature_area) DO UPDATE
  SET status          = EXCLUDED.status,
      open_items      = EXCLUDED.open_items,
      completed_items = EXCLUDED.completed_items,
      updated_at      = NOW();

-- Verification:
--   SELECT count(*) FROM public.ai_project_dashboard_metrics;             -- expect 7
--   SELECT feature_area, status, completed_items
--     FROM public.ai_project_dashboard_metrics ORDER BY feature_area;
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'ai_project_dashboard_metrics';  -- expect 2
