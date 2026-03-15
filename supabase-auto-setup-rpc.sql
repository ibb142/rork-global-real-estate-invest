-- =============================================================================
-- IVXHOLDINGS — AUTO-SETUP RPC FUNCTION
-- =============================================================================
-- Run this ONCE in Supabase SQL Editor:
--   Dashboard > SQL Editor > New Query > Paste ALL of this > Click "Run"
--
-- After running this, the app will automatically create/verify all tables
-- on every startup by calling: supabase.rpc('auto_setup_all_tables')
-- =============================================================================

-- Grant execute permission to anon and authenticated roles
-- so the app can call this RPC without service_role key

CREATE OR REPLACE FUNCTION public.auto_setup_all_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _result jsonb := '[]'::jsonb;
  _created text[] := '{}';
  _existing text[] := '{}';
  _errors text[] := '{}';
BEGIN

  -- 0. HELPER FUNCTIONS
  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean AS $fn$
  BEGIN
    RETURN (
      SELECT COALESCE(
        (auth.jwt()->'user_metadata'->>'role') = 'admin'
        OR (auth.jwt()->'app_metadata'->>'role') = 'admin',
        false
      )
    );
  END;
  $fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

  CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql;

  CREATE OR REPLACE FUNCTION public.set_jv_updated_at()
  RETURNS trigger AS $fn$
  BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql;

  -- 1. PROFILES
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    CREATE TABLE public.profiles (
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
    _created := array_append(_created, 'profiles');
  ELSE
    _existing := array_append(_existing, 'profiles');
  END IF;

  -- profiles policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_insert_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;

  DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
  CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  -- handle_new_user trigger
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $fn$
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
  $fn$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  -- 2. WALLETS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets' AND table_schema = 'public') THEN
    CREATE TABLE public.wallets (
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
    _created := array_append(_created, 'wallets');
  ELSE
    _existing := array_append(_existing, 'wallets');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'wallets_select_own' AND tablename = 'wallets') THEN
    CREATE POLICY wallets_select_own ON wallets FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'wallets_update_own' AND tablename = 'wallets') THEN
    CREATE POLICY wallets_update_own ON wallets FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'wallets_insert_own' AND tablename = 'wallets') THEN
    CREATE POLICY wallets_insert_own ON wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
  DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
  CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  -- 3. PROPERTIES
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'properties' AND table_schema = 'public') THEN
    CREATE TABLE public.properties (
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
    _created := array_append(_created, 'properties');
  ELSE
    _existing := array_append(_existing, 'properties');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_select_all' AND tablename = 'properties') THEN
    CREATE POLICY properties_select_all ON properties FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_insert_admin' AND tablename = 'properties') THEN
    CREATE POLICY properties_insert_admin ON properties FOR INSERT WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_update_admin' AND tablename = 'properties') THEN
    CREATE POLICY properties_update_admin ON properties FOR UPDATE USING (public.is_admin());
  END IF;
  CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
  CREATE INDEX IF NOT EXISTS idx_properties_created ON properties(created_at DESC);
  DROP TRIGGER IF EXISTS trg_properties_updated_at ON properties;
  CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  -- 4. MARKET_DATA
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_data' AND table_schema = 'public') THEN
    CREATE TABLE public.market_data (
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
    _created := array_append(_created, 'market_data');
  ELSE
    _existing := array_append(_existing, 'market_data');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'market_data_select_all' AND tablename = 'market_data') THEN
    CREATE POLICY market_data_select_all ON market_data FOR SELECT USING (true);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_market_data_property ON market_data("propertyId");
  DROP TRIGGER IF EXISTS trg_market_data_updated_at ON market_data;
  CREATE TRIGGER trg_market_data_updated_at BEFORE UPDATE ON market_data FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  -- 5. HOLDINGS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'holdings' AND table_schema = 'public') THEN
    CREATE TABLE public.holdings (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      property_id text REFERENCES properties(id) ON DELETE SET NULL,
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
    _created := array_append(_created, 'holdings');
  ELSE
    _existing := array_append(_existing, 'holdings');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holdings_select_own' AND tablename = 'holdings') THEN
    CREATE POLICY holdings_select_own ON holdings FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holdings_insert_own' AND tablename = 'holdings') THEN
    CREATE POLICY holdings_insert_own ON holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'holdings_update_own' AND tablename = 'holdings') THEN
    CREATE POLICY holdings_update_own ON holdings FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);

  -- 6. TRANSACTIONS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions' AND table_schema = 'public') THEN
    CREATE TABLE public.transactions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type text CHECK (type IN ('deposit','withdrawal','buy','sell','dividend','fee')),
      amount numeric DEFAULT 0,
      status text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
      description text,
      property_id text REFERENCES properties(id) ON DELETE SET NULL,
      property_name text,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'transactions');
  ELSE
    _existing := array_append(_existing, 'transactions');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'transactions_select_own' AND tablename = 'transactions') THEN
    CREATE POLICY transactions_select_own ON transactions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'transactions_insert_own' AND tablename = 'transactions') THEN
    CREATE POLICY transactions_insert_own ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

  -- 7. NOTIFICATIONS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN
    CREATE TABLE public.notifications (
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
    _created := array_append(_created, 'notifications');
  ELSE
    _existing := array_append(_existing, 'notifications');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_select_own' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_update_own' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_insert_scoped' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_insert_scoped ON notifications FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
  END IF;
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

  -- 8. ANALYTICS_EVENTS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_events' AND table_schema = 'public') THEN
    CREATE TABLE public.analytics_events (
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
    _created := array_append(_created, 'analytics_events');
  ELSE
    _existing := array_append(_existing, 'analytics_events');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'analytics_select_own' AND tablename = 'analytics_events') THEN
    CREATE POLICY analytics_select_own ON analytics_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'analytics_insert_auth' AND tablename = 'analytics_events') THEN
    CREATE POLICY analytics_insert_auth ON analytics_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_category ON analytics_events(category);

  -- 9. IMAGE_REGISTRY
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'image_registry' AND table_schema = 'public') THEN
    CREATE TABLE public.image_registry (
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
    _created := array_append(_created, 'image_registry');
  ELSE
    _existing := array_append(_existing, 'image_registry');
  END IF;

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
  CREATE INDEX IF NOT EXISTS idx_images_user ON image_registry(user_id);
  CREATE INDEX IF NOT EXISTS idx_images_entity ON image_registry(entity_type, entity_id);

  -- 10. PUSH_TOKENS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_tokens' AND table_schema = 'public') THEN
    CREATE TABLE public.push_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      token text NOT NULL,
      platform text CHECK (platform IN ('ios','android','web')),
      updated_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(),
      UNIQUE(user_id, token)
    );
    ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'push_tokens');
  ELSE
    _existing := array_append(_existing, 'push_tokens');
  END IF;

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
  CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
  DROP TRIGGER IF EXISTS trg_push_tokens_updated_at ON push_tokens;
  CREATE TRIGGER trg_push_tokens_updated_at BEFORE UPDATE ON push_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  -- 11. JV_DEALS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jv_deals' AND table_schema = 'public') THEN
    CREATE TABLE public.jv_deals (
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
      user_id uuid,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now(),
      submitted_at timestamptz,
      approved_at timestamptz,
      completed_at timestamptz,
      currency text,
      "profitSplit" text,
      "startDate" text,
      "endDate" text,
      "governingLaw" text,
      "disputeResolution" text,
      "confidentialityPeriod" text,
      "nonCompetePeriod" text,
      "managementFee" text,
      "performanceFee" text,
      "minimumHoldPeriod" text
    );
    ALTER TABLE jv_deals ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'jv_deals');
  ELSE
    _existing := array_append(_existing, 'jv_deals');
  END IF;

  DROP POLICY IF EXISTS jv_deals_select_scoped ON jv_deals;
  DROP POLICY IF EXISTS jv_deals_insert_scoped ON jv_deals;
  DROP POLICY IF EXISTS jv_deals_update_scoped ON jv_deals;
  DROP POLICY IF EXISTS jv_deals_delete_scoped ON jv_deals;

  CREATE POLICY jv_deals_select_scoped ON jv_deals FOR SELECT USING (
    published = true OR user_id = auth.uid() OR public.is_admin()
  );
  CREATE POLICY jv_deals_insert_scoped ON jv_deals FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (user_id = auth.uid() OR public.is_admin())
  );
  CREATE POLICY jv_deals_update_scoped ON jv_deals FOR UPDATE USING (
    user_id = auth.uid() OR public.is_admin()
  );
  CREATE POLICY jv_deals_delete_scoped ON jv_deals FOR DELETE USING (
    public.is_admin()
  );

  CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
  CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);
  CREATE INDEX IF NOT EXISTS idx_jv_deals_created ON jv_deals("createdAt" DESC);
  CREATE INDEX IF NOT EXISTS idx_jv_deals_user ON jv_deals(user_id);

  DROP TRIGGER IF EXISTS trg_jv_deals_updated_at ON jv_deals;
  CREATE TRIGGER trg_jv_deals_updated_at BEFORE UPDATE ON jv_deals FOR EACH ROW EXECUTE FUNCTION public.set_jv_updated_at();

  -- Enable realtime on jv_deals
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    _errors := array_append(_errors, 'realtime_jv_deals: ' || SQLERRM);
  END;

  -- 12. LANDING_ANALYTICS
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'landing_analytics' AND table_schema = 'public') THEN
    CREATE TABLE public.landing_analytics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event text NOT NULL,
      session_id text NOT NULL,
      properties jsonb,
      geo jsonb,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE landing_analytics ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'landing_analytics');
  ELSE
    _existing := array_append(_existing, 'landing_analytics');
  END IF;

  DROP POLICY IF EXISTS landing_analytics_select_admin ON landing_analytics;
  DROP POLICY IF EXISTS landing_analytics_insert_validated ON landing_analytics;
  CREATE POLICY landing_analytics_select_admin ON landing_analytics FOR SELECT USING (public.is_admin());
  CREATE POLICY landing_analytics_insert_validated ON landing_analytics FOR INSERT WITH CHECK (
    session_id IS NOT NULL AND length(session_id) >= 8 AND event IS NOT NULL AND length(event) >= 1
  );
  CREATE INDEX IF NOT EXISTS idx_landing_analytics_event ON landing_analytics(event);
  CREATE INDEX IF NOT EXISTS idx_landing_analytics_session ON landing_analytics(session_id);
  CREATE INDEX IF NOT EXISTS idx_landing_analytics_created ON landing_analytics(created_at DESC);

  -- 13. WAITLIST
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'waitlist' AND table_schema = 'public') THEN
    CREATE TABLE public.waitlist (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name text,
      last_name text,
      email text,
      phone text,
      goal text,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'waitlist');
  ELSE
    _existing := array_append(_existing, 'waitlist');
  END IF;

  DROP POLICY IF EXISTS waitlist_select_admin ON waitlist;
  DROP POLICY IF EXISTS waitlist_insert_validated ON waitlist;
  CREATE POLICY waitlist_select_admin ON waitlist FOR SELECT USING (public.is_admin());
  CREATE POLICY waitlist_insert_validated ON waitlist FOR INSERT WITH CHECK (
    email IS NOT NULL AND length(email) >= 5
  );

  -- 14. AUDIT_TRAIL
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_trail' AND table_schema = 'public') THEN
    CREATE TABLE public.audit_trail (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type text NOT NULL,
      entity_id text,
      entity_title text,
      action text NOT NULL,
      source text DEFAULT 'app',
      details jsonb,
      user_id uuid,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'audit_trail');
  ELSE
    _existing := array_append(_existing, 'audit_trail');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_trail_select_admin' AND tablename = 'audit_trail') THEN
    CREATE POLICY audit_trail_select_admin ON audit_trail FOR SELECT USING (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_trail_insert_auth' AND tablename = 'audit_trail') THEN
    CREATE POLICY audit_trail_insert_auth ON audit_trail FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_trail_created ON audit_trail(created_at DESC);

  -- 15. LANDING_DEALS (backup for landing page)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'landing_deals' AND table_schema = 'public') THEN
    CREATE TABLE public.landing_deals (
      id text PRIMARY KEY,
      deal_data jsonb NOT NULL,
      published boolean DEFAULT true,
      synced_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE landing_deals ENABLE ROW LEVEL SECURITY;
    _created := array_append(_created, 'landing_deals');
  ELSE
    _existing := array_append(_existing, 'landing_deals');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_deals_select_all' AND tablename = 'landing_deals') THEN
    CREATE POLICY landing_deals_select_all ON landing_deals FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_deals_insert_auth' AND tablename = 'landing_deals') THEN
    CREATE POLICY landing_deals_insert_auth ON landing_deals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_deals_update_auth' AND tablename = 'landing_deals') THEN
    CREATE POLICY landing_deals_update_auth ON landing_deals FOR UPDATE USING (auth.uid() IS NOT NULL OR public.is_admin());
  END IF;

  -- Enable realtime on landing_deals
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'landing_deals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE landing_deals;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    _errors := array_append(_errors, 'realtime_landing_deals: ' || SQLERRM);
  END;

  -- Build result
  _result := jsonb_build_object(
    'success', true,
    'created', to_jsonb(_created),
    'existing', to_jsonb(_existing),
    'errors', to_jsonb(_errors),
    'total_tables', array_length(_created, 1) + array_length(_existing, 1),
    'created_count', COALESCE(array_length(_created, 1), 0),
    'existing_count', COALESCE(array_length(_existing, 1), 0),
    'timestamp', to_jsonb(now()::text)
  );

  RETURN _result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'created', to_jsonb(_created),
    'existing', to_jsonb(_existing),
    'errors', to_jsonb(_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_setup_all_tables() TO anon;
GRANT EXECUTE ON FUNCTION public.auto_setup_all_tables() TO authenticated;

SELECT public.auto_setup_all_tables();
