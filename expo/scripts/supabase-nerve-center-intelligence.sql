CREATE TABLE IF NOT EXISTS public.nerve_center_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  anon_id TEXT,
  session_id TEXT NOT NULL,
  module_name TEXT,
  screen_name TEXT,
  platform TEXT,
  country TEXT,
  region TEXT,
  environment TEXT,
  attribution JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_events_insert_anon') THEN
    CREATE POLICY "nerve_center_events_insert_anon" ON public.nerve_center_events FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_events_insert_auth') THEN
    CREATE POLICY "nerve_center_events_insert_auth" ON public.nerve_center_events FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_nerve_center_events_occurred_at ON public.nerve_center_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_nerve_center_events_session_id ON public.nerve_center_events(session_id);
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  user_id UUID,
  anon_id TEXT,
  first_source TEXT,
  last_source TEXT,
  landing_page TEXT,
  current_module TEXT,
  platform TEXT,
  country TEXT,
  region TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_sessions_insert_anon') THEN
    CREATE POLICY "nerve_center_sessions_insert_anon" ON public.nerve_center_sessions FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_sessions_insert_auth') THEN
    CREATE POLICY "nerve_center_sessions_insert_auth" ON public.nerve_center_sessions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE,
  user_id UUID,
  anon_id TEXT,
  first_source TEXT,
  last_source TEXT,
  modules_visited JSONB DEFAULT '[]'::jsonb,
  time_spent_per_module JSONB DEFAULT '{}'::jsonb,
  clicks INTEGER DEFAULT 0,
  actions INTEGER DEFAULT 0,
  deals_viewed JSONB DEFAULT '[]'::jsonb,
  investments_started INTEGER DEFAULT 0,
  investments_completed INTEGER DEFAULT 0,
  avg_time_to_invest_ms INTEGER,
  recency_score NUMERIC DEFAULT 0,
  frequency_score NUMERIC DEFAULT 0,
  intent_score NUMERIC DEFAULT 0,
  predicted_conversion_score NUMERIC DEFAULT 0,
  investor_interest_category TEXT,
  preferred_ticket_size TEXT,
  likely_risk_appetite TEXT,
  chat_questions JSONB DEFAULT '[]'::jsonb,
  roi_signals JSONB DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_user_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_user_profiles_insert_anon') THEN
    CREATE POLICY "nerve_center_user_profiles_insert_anon" ON public.nerve_center_user_profiles FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_user_profiles_insert_auth') THEN
    CREATE POLICY "nerve_center_user_profiles_insert_auth" ON public.nerve_center_user_profiles FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_user_profiles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_investor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE,
  user_id UUID,
  anon_id TEXT,
  intent_score NUMERIC DEFAULT 0,
  readiness_score NUMERIC DEFAULT 0,
  interest_category TEXT,
  preferred_ticket_size TEXT,
  likely_risk_appetite TEXT,
  avg_time_to_invest_ms INTEGER,
  investments_started INTEGER DEFAULT 0,
  investments_completed INTEGER DEFAULT 0,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_investor_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_investor_profiles_insert_anon') THEN
    CREATE POLICY "nerve_center_investor_profiles_insert_anon" ON public.nerve_center_investor_profiles FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_investor_profiles_insert_auth') THEN
    CREATE POLICY "nerve_center_investor_profiles_insert_auth" ON public.nerve_center_investor_profiles FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_investor_profiles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_attribution_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID,
  anon_id TEXT,
  touch_type TEXT,
  source_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer TEXT,
  deep_link_source TEXT,
  referral_code TEXT,
  landing_page TEXT,
  is_first_touch BOOLEAN DEFAULT false,
  is_last_touch BOOLEAN DEFAULT false,
  touched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_attribution_touches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_attribution_touches_insert_anon') THEN
    CREATE POLICY "nerve_center_attribution_touches_insert_anon" ON public.nerve_center_attribution_touches FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_attribution_touches_insert_auth') THEN
    CREATE POLICY "nerve_center_attribution_touches_insert_auth" ON public.nerve_center_attribution_touches FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_attribution_touches; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_step TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  drop_rate NUMERIC DEFAULT 0,
  source_breakdown JSONB DEFAULT '{}'::jsonb,
  affected_cohorts JSONB DEFAULT '[]'::jsonb,
  reason TEXT,
  impacted_modules JSONB DEFAULT '[]'::jsonb,
  last_significant_change TIMESTAMPTZ,
  observed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_funnel_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_funnel_snapshots_insert_anon') THEN
    CREATE POLICY "nerve_center_funnel_snapshots_insert_anon" ON public.nerve_center_funnel_snapshots FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_funnel_snapshots_insert_auth') THEN
    CREATE POLICY "nerve_center_funnel_snapshots_insert_auth" ON public.nerve_center_funnel_snapshots FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_funnel_snapshots; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_module_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT NOT NULL,
  health_status TEXT,
  active_users INTEGER DEFAULT 0,
  drop_offs INTEGER DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_module_health ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_module_health_insert_anon') THEN
    CREATE POLICY "nerve_center_module_health_insert_anon" ON public.nerve_center_module_health FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_module_health_insert_auth') THEN
    CREATE POLICY "nerve_center_module_health_insert_auth" ON public.nerve_center_module_health FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_module_health; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_module_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT NOT NULL,
  active_users INTEGER DEFAULT 0,
  sessions_in_progress INTEGER DEFAULT 0,
  entry_source_counts JSONB DEFAULT '{}'::jsonb,
  clicks INTEGER DEFAULT 0,
  activity_depth INTEGER DEFAULT 0,
  cta_actions INTEGER DEFAULT 0,
  conversions_started INTEGER DEFAULT 0,
  conversions_completed INTEGER DEFAULT 0,
  drop_offs INTEGER DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  health_status TEXT,
  confidence_score NUMERIC DEFAULT 0,
  observed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_module_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_module_metrics_insert_anon') THEN
    CREATE POLICY "nerve_center_module_metrics_insert_anon" ON public.nerve_center_module_metrics FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_module_metrics_insert_auth') THEN
    CREATE POLICY "nerve_center_module_metrics_insert_auth" ON public.nerve_center_module_metrics FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_module_metrics; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_deal_interest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID,
  anon_id TEXT,
  deal_id TEXT,
  source_name TEXT,
  event_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_deal_interest_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_deal_interest_events_insert_anon') THEN
    CREATE POLICY "nerve_center_deal_interest_events_insert_anon" ON public.nerve_center_deal_interest_events FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_deal_interest_events_insert_auth') THEN
    CREATE POLICY "nerve_center_deal_interest_events_insert_auth" ON public.nerve_center_deal_interest_events FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_deal_interest_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nerve_center_chat_intelligence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID,
  anon_id TEXT,
  event_name TEXT,
  source_name TEXT,
  message_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.nerve_center_chat_intelligence_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_chat_intelligence_events_insert_anon') THEN
    CREATE POLICY "nerve_center_chat_intelligence_events_insert_anon" ON public.nerve_center_chat_intelligence_events FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_chat_intelligence_events_insert_auth') THEN
    CREATE POLICY "nerve_center_chat_intelligence_events_insert_auth" ON public.nerve_center_chat_intelligence_events FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.nerve_center_chat_intelligence_events; EXCEPTION WHEN duplicate_object THEN NULL; END $;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_events_select_all') THEN
    CREATE POLICY "nerve_center_events_select_all" ON public.nerve_center_events FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_sessions_select_all') THEN
    CREATE POLICY "nerve_center_sessions_select_all" ON public.nerve_center_sessions FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_user_profiles_select_all') THEN
    CREATE POLICY "nerve_center_user_profiles_select_all" ON public.nerve_center_user_profiles FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_investor_profiles_select_all') THEN
    CREATE POLICY "nerve_center_investor_profiles_select_all" ON public.nerve_center_investor_profiles FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_attribution_touches_select_all') THEN
    CREATE POLICY "nerve_center_attribution_touches_select_all" ON public.nerve_center_attribution_touches FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_funnel_snapshots_select_all') THEN
    CREATE POLICY "nerve_center_funnel_snapshots_select_all" ON public.nerve_center_funnel_snapshots FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_module_health_select_all') THEN
    CREATE POLICY "nerve_center_module_health_select_all" ON public.nerve_center_module_health FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_module_metrics_select_all') THEN
    CREATE POLICY "nerve_center_module_metrics_select_all" ON public.nerve_center_module_metrics FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_deal_interest_events_select_all') THEN
    CREATE POLICY "nerve_center_deal_interest_events_select_all" ON public.nerve_center_deal_interest_events FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_chat_intelligence_events_select_all') THEN
    CREATE POLICY "nerve_center_chat_intelligence_events_select_all" ON public.nerve_center_chat_intelligence_events FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_sessions_update_all') THEN
    CREATE POLICY "nerve_center_sessions_update_all" ON public.nerve_center_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_user_profiles_update_all') THEN
    CREATE POLICY "nerve_center_user_profiles_update_all" ON public.nerve_center_user_profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='nerve_center_investor_profiles_update_all') THEN
    CREATE POLICY "nerve_center_investor_profiles_update_all" ON public.nerve_center_investor_profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $;
