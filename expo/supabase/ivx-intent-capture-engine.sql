-- IVX Global Intent Capture Engine — Phase 1-8 schema
-- Tables for keyword discovery, intent clustering, auto landing pages,
-- AI content, multilingual variants, visitor intelligence, conversion,
-- and autonomous optimization.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.ivx_intent_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  slug text NOT NULL,
  category text NOT NULL DEFAULT 'real_estate_investment',
  country text NOT NULL DEFAULT 'US',
  city text,
  language text NOT NULL DEFAULT 'en',
  monthly_volume integer NOT NULL DEFAULT 0,
  cpc numeric(10,2) NOT NULL DEFAULT 0,
  competition numeric(3,2) NOT NULL DEFAULT 0,
  intent_score integer NOT NULL DEFAULT 0,
  commercial_score integer NOT NULL DEFAULT 0,
  roi_score integer NOT NULL DEFAULT 0,
  trend_7d numeric(6,2) NOT NULL DEFAULT 0,
  trend_30d numeric(6,2) NOT NULL DEFAULT 0,
  trend_90d numeric(6,2) NOT NULL DEFAULT 0,
  seasonality text,
  cluster text,
  buying_intent_score integer NOT NULL DEFAULT 0,
  investment_intent_score integer NOT NULL DEFAULT 0,
  capital_size_estimate text,
  probability_registration numeric(5,2) NOT NULL DEFAULT 0,
  probability_investment numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'discovered',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ivx_intent_keywords_slug UNIQUE (slug, country, language)
);

CREATE INDEX IF NOT EXISTS idx_ivx_intent_keywords_intent
  ON public.ivx_intent_keywords (intent_score DESC);
CREATE INDEX IF NOT EXISTS idx_ivx_intent_keywords_country
  ON public.ivx_intent_keywords (country);
CREATE INDEX IF NOT EXISTS idx_ivx_intent_keywords_cluster
  ON public.ivx_intent_keywords (cluster);

CREATE TABLE IF NOT EXISTS public.ivx_intent_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster text NOT NULL,
  keyword_count integer NOT NULL DEFAULT 0,
  total_volume integer NOT NULL DEFAULT 0,
  avg_intent_score integer NOT NULL DEFAULT 0,
  avg_commercial_score integer NOT NULL DEFAULT 0,
  avg_roi_score integer NOT NULL DEFAULT 0,
  estimated_capital numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ivx_intent_clusters_name UNIQUE (cluster)
);

CREATE TABLE IF NOT EXISTS public.ivx_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  keyword_id uuid REFERENCES public.ivx_intent_keywords(id) ON DELETE SET NULL,
  cluster text,
  title text NOT NULL,
  meta_description text,
  h1 text,
  country text NOT NULL DEFAULT 'US',
  language text NOT NULL DEFAULT 'en',
  has_roi_calculator boolean NOT NULL DEFAULT true,
  has_investment_calculator boolean NOT NULL DEFAULT true,
  has_faq boolean NOT NULL DEFAULT true,
  has_ai_chat boolean NOT NULL DEFAULT true,
  has_registration boolean NOT NULL DEFAULT true,
  has_kyc boolean NOT NULL DEFAULT true,
  has_schedule_meeting boolean NOT NULL DEFAULT true,
  has_live_opportunities boolean NOT NULL DEFAULT true,
  organic_visitors integer NOT NULL DEFAULT 0,
  registrations integer NOT NULL DEFAULT 0,
  qualified_investors integer NOT NULL DEFAULT 0,
  meetings_booked integer NOT NULL DEFAULT 0,
  capital_committed numeric(14,2) NOT NULL DEFAULT 0,
  seo_rank integer,
  status text NOT NULL DEFAULT 'published',
  published_at timestamptz NOT NULL DEFAULT now(),
  last_optimized_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ivx_landing_pages_slug UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_ivx_landing_pages_rank
  ON public.ivx_landing_pages (seo_rank);
CREATE INDEX IF NOT EXISTS idx_ivx_landing_pages_country
  ON public.ivx_landing_pages (country);

CREATE TABLE IF NOT EXISTS public.ivx_content_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- market_report, investment_guide, country_report, roi_study, video, short, chart, news_summary, comparison
  title text NOT NULL,
  slug text NOT NULL,
  body text,
  keywords text[],
  country text,
  language text NOT NULL DEFAULT 'en',
  keyword_id uuid REFERENCES public.ivx_intent_keywords(id) ON DELETE SET NULL,
  landing_page_id uuid REFERENCES public.ivx_landing_pages(id) ON DELETE SET NULL,
  views integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published',
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ivx_content_pieces_slug UNIQUE (slug, language)
);

CREATE TABLE IF NOT EXISTS public.ivx_visitor_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  country text,
  city text,
  language text NOT NULL DEFAULT 'en',
  is_returning boolean NOT NULL DEFAULT false,
  pages_viewed text[] NOT NULL DEFAULT '{}',
  investment_interests text[] NOT NULL DEFAULT '{}',
  capital_range text,
  preferred_asset_class text,
  conversation_history jsonb,
  registration_status text NOT NULL DEFAULT 'anonymous',
  landing_page_slug text,
  keyword_id uuid REFERENCES public.ivx_intent_keywords(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ivx_visitor_intelligence_vid UNIQUE (visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_ivx_visitor_country
  ON public.ivx_visitor_intelligence (country);
CREATE INDEX IF NOT EXISTS idx_ivx_visitor_reg
  ON public.ivx_visitor_intelligence (registration_status);

CREATE TABLE IF NOT EXISTS public.ivx_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  landing_page_slug text,
  messages jsonb NOT NULL DEFAULT '[]',
  intent_detected text,
  outcome text, -- roi_answered, risk_answered, registered, scheduled, kyc_started, invested
  capital_disclosed numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ivx_optimization_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL, -- daily_optimization, keyword_discovery, page_creation, traffic_decline, country_expansion, campaign_recommendation
  keywords_discovered integer NOT NULL DEFAULT 0,
  pages_created integer NOT NULL DEFAULT 0,
  pages_updated integer NOT NULL DEFAULT 0,
  pages_declined integer NOT NULL DEFAULT 0,
  new_countries integer NOT NULL DEFAULT 0,
  campaigns_recommended integer NOT NULL DEFAULT 0,
  executive_report jsonb,
  status text NOT NULL DEFAULT 'completed',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ivx_intent_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  source text NOT NULL,
  keyword_id uuid,
  landing_page_id uuid,
  visitor_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ivx_intent_audit_action
  ON public.ivx_intent_audit (action);
CREATE INDEX IF NOT EXISTS idx_ivx_intent_audit_created
  ON public.ivx_intent_audit (created_at DESC);
