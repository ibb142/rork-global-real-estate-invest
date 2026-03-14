-- =============================================================================
-- IVXHOLDINGS Supabase Tables Migration
-- =============================================================================
-- Run this ENTIRE script in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- It creates all 12 tables your app needs with proper types, indexes, and RLS policies.
-- Safe to run multiple times — uses IF NOT EXISTS.
-- =============================================================================

-- 1. PROFILES — Extended user profile (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  phone text,
  country text,
  avatar text,
  kyc_status text DEFAULT 'pending' CHECK (kyc_status IN ('pending','in_review','approved','rejected')),
  total_invested numeric DEFAULT 0,
  total_returns numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_insert_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'firstName', ''),
    COALESCE(NEW.raw_user_meta_data->>'lastName', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. WALLETS — User wallet / balance
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available numeric DEFAULT 0,
  pending numeric DEFAULT 0,
  invested numeric DEFAULT 0,
  total numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'wallets_select_own' AND tablename = 'wallets') THEN
    CREATE POLICY wallets_select_own ON wallets FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'wallets_update_own' AND tablename = 'wallets') THEN
    CREATE POLICY wallets_update_own ON wallets FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'wallets_insert_own' AND tablename = 'wallets') THEN
    CREATE POLICY wallets_insert_own ON wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);


-- 3. PROPERTIES — Real estate property listings
CREATE TABLE IF NOT EXISTS properties (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  location text,
  city text,
  country text,
  images jsonb DEFAULT '[]'::jsonb,
  price_per_share numeric DEFAULT 0,
  total_shares integer DEFAULT 0,
  available_shares integer DEFAULT 0,
  min_investment numeric DEFAULT 0,
  target_raise numeric DEFAULT 0,
  current_raise numeric DEFAULT 0,
  yield numeric DEFAULT 0,
  cap_rate numeric DEFAULT 0,
  irr numeric DEFAULT 0,
  occupancy numeric DEFAULT 0,
  property_type text DEFAULT 'residential' CHECK (property_type IN ('residential','commercial','mixed','industrial')),
  status text DEFAULT 'coming_soon' CHECK (status IN ('live','coming_soon','funded','closed')),
  risk_level text DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  description text,
  highlights jsonb DEFAULT '[]'::jsonb,
  documents jsonb DEFAULT '[]'::jsonb,
  distributions jsonb DEFAULT '[]'::jsonb,
  price_history jsonb DEFAULT '[]'::jsonb,
  closing_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_select_all' AND tablename = 'properties') THEN
    CREATE POLICY properties_select_all ON properties FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_insert_auth' AND tablename = 'properties') THEN
    CREATE POLICY properties_insert_auth ON properties FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_update_auth' AND tablename = 'properties') THEN
    CREATE POLICY properties_update_auth ON properties FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_created ON properties(created_at DESC);


-- 4. MARKET_DATA — Real-time market info per property
CREATE TABLE IF NOT EXISTS market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  "lastPrice" numeric DEFAULT 0,
  "change24h" numeric DEFAULT 0,
  "changePercent24h" numeric DEFAULT 0,
  "volume24h" numeric DEFAULT 0,
  "high24h" numeric DEFAULT 0,
  "low24h" numeric DEFAULT 0,
  bids jsonb DEFAULT '[]'::jsonb,
  asks jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE("propertyId")
);

ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'market_data_select_all' AND tablename = 'market_data') THEN
    CREATE POLICY market_data_select_all ON market_data FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_market_data_property ON market_data("propertyId");


-- 5. HOLDINGS — User property holdings
CREATE TABLE IF NOT EXISTS holdings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id text,
  shares integer DEFAULT 0,
  avg_cost_basis numeric DEFAULT 0,
  current_value numeric DEFAULT 0,
  total_return numeric DEFAULT 0,
  total_return_percent numeric DEFAULT 0,
  unrealized_pnl numeric DEFAULT 0,
  unrealized_pnl_percent numeric DEFAULT 0,
  purchase_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holdings_select_own' AND tablename = 'holdings') THEN
    CREATE POLICY holdings_select_own ON holdings FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holdings_insert_own' AND tablename = 'holdings') THEN
    CREATE POLICY holdings_insert_own ON holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holdings_update_own' AND tablename = 'holdings') THEN
    CREATE POLICY holdings_update_own ON holdings FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);


-- 6. TRANSACTIONS — Financial transactions
CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('deposit','withdrawal','buy','sell','dividend','fee')),
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  description text,
  property_id text,
  property_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'transactions_select_own' AND tablename = 'transactions') THEN
    CREATE POLICY transactions_select_own ON transactions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'transactions_insert_own' AND tablename = 'transactions') THEN
    CREATE POLICY transactions_insert_own ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);


-- 7. NOTIFICATIONS — User notifications
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('kyc','transaction','dividend','order','system')),
  title text NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false,
  action_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_select_own' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_update_own' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_insert_auth' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_insert_auth ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);


-- 8. ANALYTICS_EVENTS — App analytics tracking
CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text CHECK (category IN ('navigation','user_action','transaction','error','performance','engagement','conversion')),
  properties text,
  timestamp timestamptz NOT NULL,
  session_id text NOT NULL,
  platform text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'analytics_select_own' AND tablename = 'analytics_events') THEN
    CREATE POLICY analytics_select_own ON analytics_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'analytics_insert_auth' AND tablename = 'analytics_events') THEN
    CREATE POLICY analytics_insert_auth ON analytics_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_category ON analytics_events(category);


-- 9. IMAGE_REGISTRY — Stored image tracking
CREATE TABLE IF NOT EXISTS image_registry (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  uri text NOT NULL,
  original_uri text,
  entity_type text CHECK (entity_type IN ('property','profile','document','kyc','general')),
  entity_id text,
  uploaded_by text,
  uploaded_at timestamptz DEFAULT now(),
  is_protected boolean DEFAULT true,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE image_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'images_select_own' AND tablename = 'image_registry') THEN
    CREATE POLICY images_select_own ON image_registry FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'images_insert_own' AND tablename = 'image_registry') THEN
    CREATE POLICY images_insert_own ON image_registry FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'images_update_own' AND tablename = 'image_registry') THEN
    CREATE POLICY images_update_own ON image_registry FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'images_delete_own' AND tablename = 'image_registry') THEN
    CREATE POLICY images_delete_own ON image_registry FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_images_user ON image_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_images_entity ON image_registry(entity_type, entity_id);


-- 10. PUSH_TOKENS — Push notification device tokens
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text CHECK (platform IN ('ios','android','web')),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_tokens_select_own' AND tablename = 'push_tokens') THEN
    CREATE POLICY push_tokens_select_own ON push_tokens FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_tokens_insert_own' AND tablename = 'push_tokens') THEN
    CREATE POLICY push_tokens_insert_own ON push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_tokens_update_own' AND tablename = 'push_tokens') THEN
    CREATE POLICY push_tokens_update_own ON push_tokens FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_tokens_delete_own' AND tablename = 'push_tokens') THEN
    CREATE POLICY push_tokens_delete_own ON push_tokens FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);


-- 11. JV_DEALS — Joint Venture deal agreements
CREATE TABLE IF NOT EXISTS jv_deals (
  id text PRIMARY KEY,
  title text,
  "projectName" text,
  type text,
  description text,
  partner_name text,
  partner_email text,
  partner_phone text,
  partner_type text,
  "propertyAddress" text,
  property_address text,
  city text,
  state text,
  zip_code text,
  country text,
  lot_size numeric,
  lot_size_unit text,
  zoning text,
  property_type text,
  "totalInvestment" numeric DEFAULT 0,
  "expectedROI" numeric DEFAULT 0,
  estimated_value numeric,
  appraised_value numeric,
  cash_payment_percent numeric,
  collateral_percent numeric,
  partner_profit_share numeric,
  developer_profit_share numeric,
  term_months integer,
  cash_payment_amount numeric,
  collateral_amount numeric,
  "distributionFrequency" text,
  "exitStrategy" text,
  partners jsonb,
  "poolTiers" jsonb,
  status text DEFAULT 'draft',
  published boolean DEFAULT false,
  "publishedAt" timestamptz,
  photos jsonb DEFAULT '[]'::jsonb,
  documents jsonb DEFAULT '[]'::jsonb,
  notes text,
  rejection_reason text,
  control_disclosure_accepted boolean DEFAULT false,
  control_disclosure_accepted_at timestamptz,
  payment_structure text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE jv_deals ENABLE ROW LEVEL SECURITY;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_select_all' AND tablename = 'jv_deals') THEN
    CREATE POLICY jv_deals_select_all ON jv_deals FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_insert_all' AND tablename = 'jv_deals') THEN
    CREATE POLICY jv_deals_insert_all ON jv_deals FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_update_all' AND tablename = 'jv_deals') THEN
    CREATE POLICY jv_deals_update_all ON jv_deals FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_delete_auth' AND tablename = 'jv_deals') THEN
    CREATE POLICY jv_deals_delete_auth ON jv_deals FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;
END $;

CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);
CREATE INDEX IF NOT EXISTS idx_jv_deals_created ON jv_deals("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_jv_deals_user ON jv_deals(user_id);


-- 12. LANDING_ANALYTICS — Landing page event tracking (public, no auth required)
CREATE TABLE IF NOT EXISTS landing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  session_id text NOT NULL,
  properties jsonb,
  geo jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE landing_analytics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_analytics_select_all' AND tablename = 'landing_analytics') THEN
    CREATE POLICY landing_analytics_select_all ON landing_analytics FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_analytics_insert_all' AND tablename = 'landing_analytics') THEN
    CREATE POLICY landing_analytics_insert_all ON landing_analytics FOR INSERT WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_landing_analytics_event ON landing_analytics(event);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_session ON landing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_created ON landing_analytics(created_at DESC);


-- =============================================================================
-- DONE! All 12 tables created:
-- 1.  profiles          — User profiles (auto-created on signup)
-- 2.  wallets           — User wallet balances
-- 3.  properties        — Real estate listings
-- 4.  market_data       — Property market data
-- 5.  holdings          — User property holdings
-- 6.  transactions      — Financial transactions
-- 7.  notifications     — User notifications
-- 8.  analytics_events  — App analytics
-- 9.  image_registry    — Stored images
-- 10. push_tokens       — Push notification tokens
-- 11. jv_deals          — JV agreements (with photos)
-- 12. landing_analytics — Landing page tracking
-- =============================================================================
