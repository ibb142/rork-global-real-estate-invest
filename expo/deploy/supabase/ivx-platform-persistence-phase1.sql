-- =============================================================================
-- IVX Platform Persistence — Phase 1 (Core Owner Write-Through)
-- Idempotent migration. Safe to re-run.
--
-- Creates owner-controlled tables with RLS:
--   * platform_settings        (key/value owner settings)
--   * fee_configurations       (fee config persistence, if missing)
--   * property_controls        (owner overrides for properties)
--   * notification_events      (delivery log)
--   * deployment_history       (owner-triggered deploys)
--   * ai_usage_logs            (per-request AI accounting)
--   * audit_events             (immutable owner action log)
--
-- RLS strategy:
--   * service_role bypasses RLS (used by IVX backend proxy).
--   * Owner identity is determined by profiles.role IN ('owner','admin','super_admin').
--   * A helper function ivx_is_owner() centralizes the check.
--   * audit_events is append-only from owners; readable by owners only.
-- =============================================================================

-- ---------- Helper: ivx_is_owner() ------------------------------------------
CREATE OR REPLACE FUNCTION public.ivx_is_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.role, '') IN ('owner', 'admin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.ivx_is_owner() TO authenticated, anon, service_role;

-- ---------- platform_settings -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_settings_category_idx
  ON public.platform_settings (category);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_owner_select ON public.platform_settings;
CREATE POLICY platform_settings_owner_select
  ON public.platform_settings FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS platform_settings_owner_write ON public.platform_settings;
CREATE POLICY platform_settings_owner_write
  ON public.platform_settings FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- fee_configurations ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_configurations (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  percentage  NUMERIC(6,3) NOT NULL DEFAULT 0,
  min_fee     NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_fee     NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_configurations_type_idx
  ON public.fee_configurations (type);

ALTER TABLE public.fee_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_configurations_owner_select ON public.fee_configurations;
CREATE POLICY fee_configurations_owner_select
  ON public.fee_configurations FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS fee_configurations_owner_write ON public.fee_configurations;
CREATE POLICY fee_configurations_owner_write
  ON public.fee_configurations FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- property_controls -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_controls (
  property_id   TEXT PRIMARY KEY,
  is_featured   BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden     BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  override_status TEXT,
  override_price  NUMERIC(14,2),
  notes         TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.property_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_controls_owner_select ON public.property_controls;
CREATE POLICY property_controls_owner_select
  ON public.property_controls FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS property_controls_owner_write ON public.property_controls;
CREATE POLICY property_controls_owner_write
  ON public.property_controls FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- notification_events ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms','push','in_app','webhook')),
  topic       TEXT NOT NULL,
  recipient   TEXT,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error       TEXT,
  delivered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_events_topic_idx
  ON public.notification_events (topic, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_events_status_idx
  ON public.notification_events (status, created_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_events_owner_select ON public.notification_events;
CREATE POLICY notification_events_owner_select
  ON public.notification_events FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS notification_events_owner_write ON public.notification_events;
CREATE POLICY notification_events_owner_write
  ON public.notification_events FOR INSERT
  WITH CHECK (public.ivx_is_owner());

-- ---------- deployment_history ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.deployment_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target        TEXT NOT NULL CHECK (target IN ('backend','landing','mobile','infra','other')),
  status        TEXT NOT NULL CHECK (status IN ('triggered','running','success','failed','rolled_back')),
  service_id    TEXT,
  deploy_id     TEXT,
  commit_sha    TEXT,
  triggered_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_reason TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deployment_history_target_idx
  ON public.deployment_history (target, started_at DESC);

ALTER TABLE public.deployment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deployment_history_owner_select ON public.deployment_history;
CREATE POLICY deployment_history_owner_select
  ON public.deployment_history FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS deployment_history_owner_insert ON public.deployment_history;
CREATE POLICY deployment_history_owner_insert
  ON public.deployment_history FOR INSERT
  WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS deployment_history_owner_update ON public.deployment_history;
CREATE POLICY deployment_history_owner_update
  ON public.deployment_history FOR UPDATE
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- ai_usage_logs ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL DEFAULT '',
  surface      TEXT NOT NULL DEFAULT 'ivx_ia',
  request_id   TEXT,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  latency_ms   INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','blocked','rate_limited')),
  error        TEXT,
  cost_usd     NUMERIC(12,6) NOT NULL DEFAULT 0,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_idx
  ON public.ai_usage_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_provider_idx
  ON public.ai_usage_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_status_idx
  ON public.ai_usage_logs (status, created_at DESC);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_logs_owner_select ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_owner_select
  ON public.ai_usage_logs FOR SELECT
  USING (public.ivx_is_owner());

-- inserts come from service_role (backend proxy); no public INSERT policy.

-- ---------- audit_events ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role  TEXT,
  category    TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  before_state JSONB,
  after_state  JSONB,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_category_idx
  ON public.audit_events (category, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON public.audit_events (target_type, target_id, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_owner_select ON public.audit_events;
CREATE POLICY audit_events_owner_select
  ON public.audit_events FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS audit_events_owner_insert ON public.audit_events;
CREATE POLICY audit_events_owner_insert
  ON public.audit_events FOR INSERT
  WITH CHECK (public.ivx_is_owner());

-- audit_events is append-only: no UPDATE or DELETE policies.

-- ---------- IVX chat upload storage ----------------------------------------
-- Required by the IVX IA chat room file/image/PDF upload path.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ivx-chat-uploads',
  'ivx-chat-uploads',
  TRUE,
  52428800,
  ARRAY['image/*', 'application/pdf', 'text/plain', 'text/markdown', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $ivx_chat_uploads_policies$
BEGIN
  DROP POLICY IF EXISTS ivx_chat_uploads_public_select ON storage.objects;
  CREATE POLICY ivx_chat_uploads_public_select
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'ivx-chat-uploads');

  DROP POLICY IF EXISTS ivx_chat_uploads_auth_insert ON storage.objects;
  CREATE POLICY ivx_chat_uploads_auth_insert
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'ivx-chat-uploads');
END
$ivx_chat_uploads_policies$;

-- ---------- Auto-update updated_at -----------------------------------------
CREATE OR REPLACE FUNCTION public.ivx_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  PERFORM 1 FROM pg_trigger WHERE tgname = 'platform_settings_touch_updated_at';
  IF NOT FOUND THEN
    CREATE TRIGGER platform_settings_touch_updated_at
      BEFORE UPDATE ON public.platform_settings
      FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();
  END IF;

  PERFORM 1 FROM pg_trigger WHERE tgname = 'fee_configurations_touch_updated_at';
  IF NOT FOUND THEN
    CREATE TRIGGER fee_configurations_touch_updated_at
      BEFORE UPDATE ON public.fee_configurations
      FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();
  END IF;

  PERFORM 1 FROM pg_trigger WHERE tgname = 'property_controls_touch_updated_at';
  IF NOT FOUND THEN
    CREATE TRIGGER property_controls_touch_updated_at
      BEFORE UPDATE ON public.property_controls
      FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();
  END IF;
END
$$;

-- ---------- Realtime publication -------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_settings;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.fee_configurations;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.property_controls;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_events;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END
$$;

-- ---------- Seed fee_configurations from defaults (no-op if rows exist) ----
-- Defaults intentionally minimal; UI seeds the rest on first save.
INSERT INTO public.fee_configurations (id, type, name, percentage, min_fee, max_fee, is_active)
VALUES
  ('fee-buy',        'buy',        'Buy Fee',        2.500, 0, 0, TRUE),
  ('fee-sell',       'sell',       'Sell Fee',       2.500, 0, 0, TRUE),
  ('fee-withdrawal', 'withdrawal', 'Withdrawal Fee', 1.000, 0, 0, TRUE),
  ('fee-deposit',    'deposit',    'Deposit Fee',    0.000, 0, 0, TRUE)
ON CONFLICT (id) DO NOTHING;
