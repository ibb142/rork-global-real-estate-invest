import { supabase } from '@/lib/supabase';
import { Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export interface TableStatus {
  name: string;
  exists: boolean;
  description: string;
}

const REQUIRED_TABLES: { name: string; description: string }[] = [
  { name: 'profiles', description: 'User profiles (linked to Auth)' },
  { name: 'wallets', description: 'User wallet balances' },
  { name: 'properties', description: 'Real estate listings' },
  { name: 'market_data', description: 'Market info per property' },
  { name: 'holdings', description: 'User property holdings' },
  { name: 'transactions', description: 'Financial transactions' },
  { name: 'notifications', description: 'User notifications' },
  { name: 'analytics_events', description: 'App analytics tracking' },
  { name: 'image_registry', description: 'Stored image tracking' },
  { name: 'push_tokens', description: 'Push notification tokens' },
  { name: 'jv_deals', description: 'Joint Venture deals' },
  { name: 'landing_analytics', description: 'Landing page events' },
  { name: 'waitlist', description: 'Waitlist signups' },
];

export async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const { error } = await supabase.from(tableName).select('*').limit(0);
    if (error?.code === 'PGRST204' || error?.code === 'PGRST116') return true;
    if (error?.code === 'PGRST205' || error?.message?.includes('does not exist')) return false;
    if (!error) return true;
    console.log(`[DB Setup] Table ${tableName} check error:`, error.code, error.message);
    return false;
  } catch {
    return false;
  }
}

export async function checkAllTables(): Promise<TableStatus[]> {
  console.log('[DB Setup] Checking all 13 tables...');
  const results: TableStatus[] = [];
  for (const table of REQUIRED_TABLES) {
    const exists = await checkTableExists(table.name);
    results.push({ name: table.name, exists, description: table.description });
    console.log(`[DB Setup] ${table.name}: ${exists ? 'EXISTS' : 'MISSING'}`);
  }
  return results;
}

export function getSupabaseSQLEditorURL(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = match ? match[1] : '';
  return `https://supabase.com/dashboard/project/${ref}/sql/new`;
}

export function getSupabaseRealtimeURL(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = match ? match[1] : '';
  return `https://supabase.com/dashboard/project/${ref}/database/replication`;
}

export async function copySetupSQL(): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(MASTER_SETUP_SQL);
    console.log('[DB Setup] Master setup SQL copied to clipboard');
    return true;
  } catch (e) {
    console.log('[DB Setup] Failed to copy SQL:', e);
    return false;
  }
}

export async function copyVerifySQL(): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(VERIFY_SQL);
    console.log('[DB Setup] Verify SQL copied to clipboard');
    return true;
  } catch (e) {
    console.log('[DB Setup] Failed to copy verify SQL:', e);
    return false;
  }
}

export function openSupabaseSQLEditor(): void {
  const url = getSupabaseSQLEditorURL();
  console.log('[DB Setup] Opening Supabase SQL Editor:', url);
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
  } else {
    void Linking.openURL(url);
  }
}

export function openSupabaseRealtime(): void {
  const url = getSupabaseRealtimeURL();
  console.log('[DB Setup] Opening Supabase Realtime:', url);
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
  } else {
    void Linking.openURL(url);
  }
}

export const MASTER_SETUP_SQL = `-- =============================================================================
-- IVXHOLDINGS — MASTER SUPABASE SETUP (All Tables + RLS + Realtime)
-- =============================================================================
-- Safe to run multiple times (uses IF NOT EXISTS / DROP IF EXISTS).
-- Creates ALL 13 tables, RLS policies, indexes, triggers, and enables Realtime.
-- =============================================================================

-- 0. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $f$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND COALESCE(role, 'investor') IN ('owner', 'admin', 'ceo', 'manager', 'staff', 'analyst', 'support')
  );
END;
$f$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $f$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql;

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text, last_name text, email text, phone text, country text, avatar text,
  role text DEFAULT 'investor',
  status text DEFAULT 'active' CHECK (status IN ('active','suspended','inactive','archived')),
  kyc_status text DEFAULT 'pending' CHECK (kyc_status IN ('pending','in_review','approved','rejected')),
  total_invested numeric DEFAULT 0, total_returns numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'investor';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_own' AND tablename='profiles') THEN CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid()=id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_admin' AND tablename='profiles') THEN CREATE POLICY profiles_select_admin ON profiles FOR SELECT USING (public.is_admin()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_update_own' AND tablename='profiles') THEN CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid()=id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_update_admin' AND tablename='profiles') THEN CREATE POLICY profiles_update_admin ON profiles FOR UPDATE USING (public.is_admin()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_insert_own' AND tablename='profiles') THEN CREATE POLICY profiles_insert_own ON profiles FOR INSERT WITH CHECK (auth.uid()=id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_insert_admin' AND tablename='profiles') THEN CREATE POLICY profiles_insert_admin ON profiles FOR INSERT WITH CHECK (public.is_admin()); END IF;
END $;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $f$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, phone, country, role, status, kyc_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'firstName',''),
    COALESCE(NEW.raw_user_meta_data->>'lastName',''),
    COALESCE(NEW.raw_user_meta_data->>'phone',''),
    COALESCE(NEW.raw_user_meta_data->>'country',''),
    COALESCE(NEW.raw_user_meta_data->>'role','investor'),
    'active',
    COALESCE(NEW.raw_user_meta_data->>'kycStatus','pending')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. WALLETS
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available numeric DEFAULT 0, pending numeric DEFAULT 0, invested numeric DEFAULT 0, total numeric DEFAULT 0,
  currency text DEFAULT 'USD', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(user_id)
);
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wallets_select_own' AND tablename='wallets') THEN CREATE POLICY wallets_select_own ON wallets FOR SELECT USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wallets_update_own' AND tablename='wallets') THEN CREATE POLICY wallets_update_own ON wallets FOR UPDATE USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wallets_insert_own' AND tablename='wallets') THEN CREATE POLICY wallets_insert_own ON wallets FOR INSERT WITH CHECK (auth.uid()=user_id); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. PROPERTIES
CREATE TABLE IF NOT EXISTS properties (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, name text NOT NULL, location text, city text, country text,
  images jsonb DEFAULT '[]'::jsonb, price_per_share numeric DEFAULT 0, total_shares integer DEFAULT 0,
  available_shares integer DEFAULT 0, min_investment numeric DEFAULT 0, target_raise numeric DEFAULT 0,
  current_raise numeric DEFAULT 0, yield numeric DEFAULT 0, cap_rate numeric DEFAULT 0, irr numeric DEFAULT 0,
  occupancy numeric DEFAULT 0,
  property_type text DEFAULT 'residential' CHECK (property_type IN ('residential','commercial','mixed','industrial')),
  status text DEFAULT 'coming_soon' CHECK (status IN ('live','coming_soon','funded','closed')),
  risk_level text DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  description text, highlights jsonb DEFAULT '[]'::jsonb, documents jsonb DEFAULT '[]'::jsonb,
  distributions jsonb DEFAULT '[]'::jsonb, price_history jsonb DEFAULT '[]'::jsonb,
  closing_date timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='properties_select_all' AND tablename='properties') THEN CREATE POLICY properties_select_all ON properties FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='properties_insert_admin' AND tablename='properties') THEN CREATE POLICY properties_insert_admin ON properties FOR INSERT WITH CHECK (public.is_admin()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='properties_update_admin' AND tablename='properties') THEN CREATE POLICY properties_update_admin ON properties FOR UPDATE USING (public.is_admin()); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_created ON properties(created_at DESC);
DROP TRIGGER IF EXISTS trg_properties_updated_at ON properties;
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. MARKET_DATA
CREATE TABLE IF NOT EXISTS market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL, "lastPrice" numeric DEFAULT 0, "change24h" numeric DEFAULT 0,
  "changePercent24h" numeric DEFAULT 0, "volume24h" numeric DEFAULT 0, "high24h" numeric DEFAULT 0,
  "low24h" numeric DEFAULT 0, bids jsonb DEFAULT '[]'::jsonb, asks jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(), UNIQUE("propertyId")
);
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='market_data_select_all' AND tablename='market_data') THEN CREATE POLICY market_data_select_all ON market_data FOR SELECT USING (true); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_market_data_property ON market_data("propertyId");
DROP TRIGGER IF EXISTS trg_market_data_updated_at ON market_data;
CREATE TRIGGER trg_market_data_updated_at BEFORE UPDATE ON market_data FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. HOLDINGS
CREATE TABLE IF NOT EXISTS holdings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id text REFERENCES properties(id) ON DELETE SET NULL,
  shares integer DEFAULT 0, avg_cost_basis numeric DEFAULT 0, current_value numeric DEFAULT 0,
  total_return numeric DEFAULT 0, total_return_percent numeric DEFAULT 0,
  unrealized_pnl numeric DEFAULT 0, unrealized_pnl_percent numeric DEFAULT 0,
  purchase_date timestamptz DEFAULT now(), created_at timestamptz DEFAULT now()
);
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='holdings_select_own' AND tablename='holdings') THEN CREATE POLICY holdings_select_own ON holdings FOR SELECT USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='holdings_insert_own' AND tablename='holdings') THEN CREATE POLICY holdings_insert_own ON holdings FOR INSERT WITH CHECK (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='holdings_update_own' AND tablename='holdings') THEN CREATE POLICY holdings_update_own ON holdings FOR UPDATE USING (auth.uid()=user_id); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);

-- 6. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('deposit','withdrawal','buy','sell','dividend','fee')),
  amount numeric DEFAULT 0, status text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  description text, property_id text REFERENCES properties(id) ON DELETE SET NULL,
  property_name text, created_at timestamptz DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='transactions_select_own' AND tablename='transactions') THEN CREATE POLICY transactions_select_own ON transactions FOR SELECT USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='transactions_insert_own' AND tablename='transactions') THEN CREATE POLICY transactions_insert_own ON transactions FOR INSERT WITH CHECK (auth.uid()=user_id); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- 7. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('kyc','transaction','dividend','order','system')),
  title text NOT NULL, message text NOT NULL, read boolean DEFAULT false,
  action_url text, created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='notifications_select_own' AND tablename='notifications') THEN CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='notifications_update_own' AND tablename='notifications') THEN CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='notifications_insert_scoped' AND tablename='notifications') THEN CREATE POLICY notifications_insert_scoped ON notifications FOR INSERT WITH CHECK (auth.uid()=user_id OR public.is_admin()); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 8. ANALYTICS_EVENTS
CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL, category text CHECK (category IN ('navigation','user_action','transaction','error','performance','engagement','conversion')),
  properties text, timestamp timestamptz NOT NULL, session_id text NOT NULL,
  platform text, created_at timestamptz DEFAULT now()
);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_select_own ON analytics_events;
DROP POLICY IF EXISTS analytics_select_admin ON analytics_events;
DROP POLICY IF EXISTS analytics_insert_auth ON analytics_events;
DROP POLICY IF EXISTS analytics_insert_anon ON analytics_events;
CREATE POLICY analytics_select_own ON analytics_events FOR SELECT USING (auth.uid()=user_id OR user_id IS NULL);
CREATE POLICY analytics_select_admin ON analytics_events FOR SELECT USING (public.is_admin());
CREATE POLICY analytics_insert_auth ON analytics_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR user_id IS NULL);
CREATE POLICY analytics_insert_anon ON analytics_events FOR INSERT WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_category ON analytics_events(category);

-- 9. IMAGE_REGISTRY
CREATE TABLE IF NOT EXISTS image_registry (
  id text PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  uri text NOT NULL, original_uri text,
  entity_type text CHECK (entity_type IN ('property','profile','document','kyc','general')),
  entity_id text, uploaded_by text, uploaded_at timestamptz DEFAULT now(),
  is_protected boolean DEFAULT true, file_name text, mime_type text, size_bytes bigint,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE image_registry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='images_select_own' AND tablename='image_registry') THEN CREATE POLICY images_select_own ON image_registry FOR SELECT USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='images_insert_own' AND tablename='image_registry') THEN CREATE POLICY images_insert_own ON image_registry FOR INSERT WITH CHECK (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='images_update_own' AND tablename='image_registry') THEN CREATE POLICY images_update_own ON image_registry FOR UPDATE USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='images_delete_own' AND tablename='image_registry') THEN CREATE POLICY images_delete_own ON image_registry FOR DELETE USING (auth.uid()=user_id); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_images_user ON image_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_images_entity ON image_registry(entity_type, entity_id);

-- 10. PUSH_TOKENS
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL, platform text CHECK (platform IN ('ios','android','web')),
  updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(), UNIQUE(user_id, token)
);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='push_tokens_select_own' AND tablename='push_tokens') THEN CREATE POLICY push_tokens_select_own ON push_tokens FOR SELECT USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='push_tokens_insert_own' AND tablename='push_tokens') THEN CREATE POLICY push_tokens_insert_own ON push_tokens FOR INSERT WITH CHECK (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='push_tokens_update_own' AND tablename='push_tokens') THEN CREATE POLICY push_tokens_update_own ON push_tokens FOR UPDATE USING (auth.uid()=user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='push_tokens_delete_own' AND tablename='push_tokens') THEN CREATE POLICY push_tokens_delete_own ON push_tokens FOR DELETE USING (auth.uid()=user_id); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
DROP TRIGGER IF EXISTS trg_push_tokens_updated_at ON push_tokens;
CREATE TRIGGER trg_push_tokens_updated_at BEFORE UPDATE ON push_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 11. JV_DEALS
CREATE TABLE IF NOT EXISTS jv_deals (
  id text PRIMARY KEY, title text, "projectName" text, type text, description text,
  partner_name text, partner_email text, partner_phone text, partner_type text,
  "propertyAddress" text, property_address text, city text, state text, zip_code text, country text,
  lot_size numeric, lot_size_unit text, zoning text, property_type text,
  "totalInvestment" numeric DEFAULT 0, "propertyValue" numeric DEFAULT 0, "expectedROI" numeric DEFAULT 0,
  estimated_value numeric, appraised_value numeric, cash_payment_percent numeric,
  collateral_percent numeric, partner_profit_share numeric, developer_profit_share numeric,
  term_months integer, cash_payment_amount numeric, collateral_amount numeric,
  "distributionFrequency" text, "exitStrategy" text, partners jsonb, "poolTiers" jsonb,
  status text DEFAULT 'draft', published boolean DEFAULT false, "publishedAt" timestamptz,
  photos jsonb DEFAULT '[]'::jsonb, documents jsonb DEFAULT '[]'::jsonb, notes text,
  rejection_reason text, control_disclosure_accepted boolean DEFAULT false,
  control_disclosure_accepted_at timestamptz, payment_structure text, user_id uuid,
  "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
  submitted_at timestamptz, approved_at timestamptz, completed_at timestamptz,
  currency text, "profitSplit" text, "startDate" text, "endDate" text,
  "governingLaw" text, "disputeResolution" text, "confidentialityPeriod" text,
  "nonCompetePeriod" text, "managementFee" text, "performanceFee" text, "minimumHoldPeriod" text
);
ALTER TABLE jv_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jv_deals_select_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_select_scoped ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_scoped ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_scoped ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_admin ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_scoped ON jv_deals;
CREATE POLICY jv_deals_select_scoped ON jv_deals FOR SELECT USING (published=true OR user_id=auth.uid() OR public.is_admin());
CREATE POLICY jv_deals_insert_scoped ON jv_deals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY jv_deals_update_scoped ON jv_deals FOR UPDATE USING (user_id=auth.uid() OR public.is_admin());
CREATE POLICY jv_deals_delete_scoped ON jv_deals FOR DELETE USING (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_jv_deals_published ON jv_deals(published);
CREATE INDEX IF NOT EXISTS idx_jv_deals_status ON jv_deals(status);
CREATE INDEX IF NOT EXISTS idx_jv_deals_created ON jv_deals("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_jv_deals_user ON jv_deals(user_id);
CREATE OR REPLACE FUNCTION public.set_jv_updated_at()
RETURNS trigger AS $f$ BEGIN NEW."updatedAt"=now(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_jv_deals_updated_at ON jv_deals;
CREATE TRIGGER trg_jv_deals_updated_at BEFORE UPDATE ON jv_deals FOR EACH ROW EXECUTE FUNCTION public.set_jv_updated_at();

-- 12. LANDING_ANALYTICS
CREATE TABLE IF NOT EXISTS landing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event text NOT NULL,
  session_id text NOT NULL, properties jsonb, geo jsonb, created_at timestamptz DEFAULT now()
);
ALTER TABLE landing_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS landing_analytics_select_all ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_select_admin ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_insert_all ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_insert_validated ON landing_analytics;
CREATE POLICY landing_analytics_select_admin ON landing_analytics FOR SELECT USING (public.is_admin());
CREATE POLICY landing_analytics_select_auth ON landing_analytics FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY landing_analytics_insert_validated ON landing_analytics FOR INSERT WITH CHECK (session_id IS NOT NULL AND length(session_id)>=8 AND event IS NOT NULL AND length(event)>=1);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_event ON landing_analytics(event);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_session ON landing_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_landing_analytics_created ON landing_analytics(created_at DESC);

-- 13. WAITLIST
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), first_name text, last_name text,
  email text, phone text, goal text, created_at timestamptz DEFAULT now()
);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_select_all ON waitlist;
DROP POLICY IF EXISTS waitlist_select_admin ON waitlist;
DROP POLICY IF EXISTS waitlist_insert_all ON waitlist;
DROP POLICY IF EXISTS waitlist_insert_validated ON waitlist;
CREATE POLICY waitlist_select_admin ON waitlist FOR SELECT USING (public.is_admin());
CREATE POLICY waitlist_insert_validated ON waitlist FOR INSERT WITH CHECK (email IS NOT NULL AND length(email)>=5);

-- 14. RESALE_LISTINGS
CREATE TABLE IF NOT EXISTS resale_listings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id text REFERENCES properties(id) ON DELETE SET NULL,
  property_name text,
  shares integer NOT NULL DEFAULT 0,
  ask_price_per_share numeric NOT NULL DEFAULT 0,
  original_cost_basis numeric DEFAULT 0,
  total_ask numeric DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active','sold','cancelled','expired')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE resale_listings ENABLE ROW LEVEL SECURITY;
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='resale_select_all' AND tablename='resale_listings') THEN
    CREATE POLICY resale_select_all ON resale_listings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='resale_insert_own' AND tablename='resale_listings') THEN
    CREATE POLICY resale_insert_own ON resale_listings FOR INSERT WITH CHECK (auth.uid()=seller_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='resale_update_own' AND tablename='resale_listings') THEN
    CREATE POLICY resale_update_own ON resale_listings FOR UPDATE USING (auth.uid()=seller_id OR public.is_admin());
  END IF;
END $;
CREATE INDEX IF NOT EXISTS idx_resale_status ON resale_listings(status);
CREATE INDEX IF NOT EXISTS idx_resale_seller ON resale_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_resale_property ON resale_listings(property_id);

-- 15. WALLET_TRANSACTIONS
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wallet_id text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('deposit','withdrawal','investment','sale_proceeds','dividend','refund','fee','resale_purchase','resale_sale')),
  amount numeric NOT NULL DEFAULT 0,
  direction text CHECK (direction IN ('credit','debit')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
  reference_id text,
  reference_type text,
  description text,
  fee numeric DEFAULT 0,
  net_amount numeric DEFAULT 0,
  payment_method text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wtx_select_own' AND tablename='wallet_transactions') THEN
    CREATE POLICY wtx_select_own ON wallet_transactions FOR SELECT USING (auth.uid()=user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='wtx_insert_own' AND tablename='wallet_transactions') THEN
    CREATE POLICY wtx_insert_own ON wallet_transactions FOR INSERT WITH CHECK (auth.uid()=user_id);
  END IF;
END $;
CREATE INDEX IF NOT EXISTS idx_wtx_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wtx_created ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wtx_type ON wallet_transactions(type);

-- 16. ANALYTICS RPC FUNCTIONS (SECURITY DEFINER — bypasses RLS for admin reads)
CREATE OR REPLACE FUNCTION public.get_landing_analytics(
  p_cutoff timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50000
) RETURNS SETOF landing_analytics
LANGUAGE sql SECURITY DEFINER STABLE
AS $
  SELECT * FROM landing_analytics
  WHERE (p_cutoff IS NULL OR created_at >= p_cutoff)
  ORDER BY created_at DESC
  LIMIT p_limit;
$;

CREATE OR REPLACE FUNCTION public.get_analytics_events(
  p_cutoff timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50000
) RETURNS SETOF analytics_events
LANGUAGE sql SECURITY DEFINER STABLE
AS $
  SELECT * FROM analytics_events
  WHERE (p_cutoff IS NULL OR created_at >= p_cutoff)
  ORDER BY created_at DESC
  LIMIT p_limit;
$;

GRANT EXECUTE ON FUNCTION public.get_landing_analytics TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_events TO anon, authenticated;

-- 17. ENABLE REALTIME ON jv_deals
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='jv_deals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals;
  END IF;
END $;

-- =============================================================================
-- 17. ATOMIC STORED PROCEDURES
-- =============================================================================

-- ATOMIC PURCHASE SHARES: Single transaction for wallet debit + holding creation/update + transaction record
CREATE OR REPLACE FUNCTION public.atomic_purchase_shares(
  p_user_id uuid,
  p_property_id text,
  p_property_name text,
  p_shares integer,
  p_price_per_share numeric,
  p_subtotal numeric,
  p_platform_fee numeric,
  p_total_cost numeric,
  p_payment_method text,
  p_investment_type text,
  p_transaction_id text,
  p_holding_id text,
  p_confirmation_number text
) RETURNS jsonb AS $fn$
DECLARE
  v_wallet_available numeric;
  v_wallet_invested numeric;
  v_existing_holding record;
  v_new_shares integer;
  v_new_cost_basis numeric;
  v_new_current_value numeric;
  v_final_holding_id text;
  v_tx_status text;
  v_tx_description text;
BEGIN
  -- Lock wallet row for update (prevents concurrent modifications)
  SELECT available, invested INTO v_wallet_available, v_wallet_invested
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, available, pending, invested, total, currency)
    VALUES (p_user_id, 0, 0, 0, 0, 'USD');
    v_wallet_available := 0;
    v_wallet_invested := 0;
  END IF;

  -- Check balance for wallet payments
  IF p_payment_method = 'wallet' AND v_wallet_available < p_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'transaction_id', '',
      'holding_id', '',
      'confirmation_number', '',
      'message', format('Insufficient balance: $%s available, $%s required', v_wallet_available::text, p_total_cost::text),
      'new_balance', v_wallet_available
    );
  END IF;

  -- Debit wallet if wallet payment
  IF p_payment_method = 'wallet' THEN
    UPDATE wallets SET
      available = GREATEST(0, available - p_total_cost),
      invested = invested + p_total_cost,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Set transaction status
  IF p_payment_method = 'wallet' THEN
    v_tx_status := 'completed';
    v_tx_description := format('Purchased %s shares of %s (%s) — Confirmation: %s', p_shares, p_property_name, p_investment_type, p_confirmation_number);
  ELSE
    v_tx_status := 'pending';
    v_tx_description := format('Pending payment: %s shares of %s (%s) via %s — Confirmation: %s', p_shares, p_property_name, p_investment_type, p_payment_method, p_confirmation_number);
  END IF;

  -- Insert transaction
  INSERT INTO transactions (id, user_id, type, amount, status, description, property_id, property_name, created_at)
  VALUES (p_transaction_id, p_user_id, 'buy', p_total_cost, v_tx_status, v_tx_description, p_property_id, p_property_name, now());

  -- Upsert holding
  SELECT * INTO v_existing_holding FROM holdings
  WHERE user_id = p_user_id AND property_id = p_property_id FOR UPDATE;

  IF FOUND THEN
    v_final_holding_id := v_existing_holding.id;
    v_new_shares := v_existing_holding.shares + p_shares;
    v_new_cost_basis := ((v_existing_holding.avg_cost_basis * v_existing_holding.shares) + p_subtotal) / v_new_shares;
    v_new_current_value := v_new_shares * p_price_per_share;

    UPDATE holdings SET
      shares = v_new_shares,
      avg_cost_basis = ROUND(v_new_cost_basis, 2),
      current_value = ROUND(v_new_current_value, 2),
      total_return = ROUND(v_new_current_value - (v_new_cost_basis * v_new_shares), 2),
      total_return_percent = CASE WHEN v_new_cost_basis > 0 THEN ROUND(((p_price_per_share - v_new_cost_basis) / v_new_cost_basis) * 100, 2) ELSE 0 END,
      unrealized_pnl = ROUND(v_new_current_value - (v_new_cost_basis * v_new_shares), 2),
      unrealized_pnl_percent = CASE WHEN v_new_cost_basis > 0 THEN ROUND(((p_price_per_share - v_new_cost_basis) / v_new_cost_basis) * 100, 2) ELSE 0 END
    WHERE id = v_existing_holding.id;
  ELSE
    v_final_holding_id := p_holding_id;
    INSERT INTO holdings (id, user_id, property_id, shares, avg_cost_basis, current_value, total_return, total_return_percent, unrealized_pnl, unrealized_pnl_percent, purchase_date, created_at)
    VALUES (p_holding_id, p_user_id, p_property_id, p_shares, p_price_per_share, ROUND(p_subtotal, 2), 0, 0, 0, 0, now(), now());
  END IF;

  -- Record platform fee if any
  IF p_platform_fee > 0 THEN
    INSERT INTO transactions (id, user_id, type, amount, status, description, property_id, property_name, created_at)
    VALUES ('fee_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6), p_user_id, 'fee', p_platform_fee, 'completed', 'Platform fee for ' || p_property_name || ' purchase', p_property_id, p_property_name, now());
  END IF;

  -- Send notification
  INSERT INTO notifications (id, user_id, type, title, message, read, created_at)
  VALUES ('notif_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6), p_user_id, 'transaction', 'Investment Confirmed', format('You purchased %s shares of %s for $%s. Confirmation: %s', p_shares, p_property_name, p_total_cost::text, p_confirmation_number), false, now());

  -- Update profile total_invested
  UPDATE profiles SET
    total_invested = COALESCE(total_invested, 0) + p_total_cost,
    updated_at = now()
  WHERE id = p_user_id;

  -- Get new balance
  SELECT available INTO v_wallet_available FROM wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'holding_id', v_final_holding_id,
    'confirmation_number', p_confirmation_number,
    'message', format('Successfully purchased %s shares of %s.', p_shares, p_property_name),
    'new_balance', COALESCE(v_wallet_available, 0)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'transaction_id', '',
    'holding_id', '',
    'confirmation_number', '',
    'message', SQLERRM,
    'new_balance', 0
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ATOMIC SELL SHARES: Single transaction for holding update/delete + wallet credit + transaction record
CREATE OR REPLACE FUNCTION public.atomic_sell_shares(
  p_user_id uuid,
  p_property_id text,
  p_property_name text,
  p_shares integer,
  p_price_per_share numeric,
  p_subtotal numeric,
  p_platform_fee numeric,
  p_net_proceeds numeric,
  p_transaction_id text,
  p_confirmation_number text
) RETURNS jsonb AS $fn$
DECLARE
  v_holding record;
  v_remaining_shares integer;
  v_new_current_value numeric;
  v_invested_reduction numeric;
BEGIN
  -- Lock holding for update
  SELECT * INTO v_holding FROM holdings
  WHERE user_id = p_user_id AND property_id = p_property_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'transaction_id', '',
      'holding_id', '',
      'confirmation_number', '',
      'message', 'You do not own shares in this property.',
      'new_balance', 0,
      'remaining_shares', 0
    );
  END IF;

  IF v_holding.shares < p_shares THEN
    RETURN jsonb_build_object(
      'success', false,
      'transaction_id', '',
      'holding_id', '',
      'confirmation_number', '',
      'message', format('You only own %s shares. Cannot sell %s.', v_holding.shares, p_shares),
      'new_balance', 0,
      'remaining_shares', v_holding.shares
    );
  END IF;

  v_remaining_shares := v_holding.shares - p_shares;
  v_invested_reduction := p_shares * v_holding.avg_cost_basis;

  -- Update or delete holding
  IF v_remaining_shares = 0 THEN
    DELETE FROM holdings WHERE id = v_holding.id;
  ELSE
    v_new_current_value := v_remaining_shares * p_price_per_share;
    UPDATE holdings SET
      shares = v_remaining_shares,
      current_value = ROUND(v_new_current_value, 2),
      total_return = ROUND(v_new_current_value - (v_holding.avg_cost_basis * v_remaining_shares), 2),
      total_return_percent = CASE WHEN v_holding.avg_cost_basis > 0 THEN ROUND(((p_price_per_share - v_holding.avg_cost_basis) / v_holding.avg_cost_basis) * 100, 2) ELSE 0 END,
      unrealized_pnl = ROUND(v_new_current_value - (v_holding.avg_cost_basis * v_remaining_shares), 2),
      unrealized_pnl_percent = CASE WHEN v_holding.avg_cost_basis > 0 THEN ROUND(((p_price_per_share - v_holding.avg_cost_basis) / v_holding.avg_cost_basis) * 100, 2) ELSE 0 END
    WHERE id = v_holding.id;
  END IF;

  -- Insert sell transaction
  INSERT INTO transactions (id, user_id, type, amount, status, description, property_id, property_name, created_at)
  VALUES (p_transaction_id, p_user_id, 'sell', p_net_proceeds, 'completed', format('Sold %s shares of %s — Net: %s — Confirmation: %s', p_shares, p_property_name, p_net_proceeds::text, p_confirmation_number), p_property_id, p_property_name, now());

  -- Credit wallet atomically (lock row)
  UPDATE wallets SET
    available = available + p_net_proceeds,
    invested = GREATEST(0, invested - v_invested_reduction),
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Record fee transaction
  IF p_platform_fee > 0 THEN
    INSERT INTO transactions (id, user_id, type, amount, status, description, property_id, property_name, created_at)
    VALUES ('fee_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6), p_user_id, 'fee', p_platform_fee, 'completed', 'Platform fee for ' || p_property_name || ' sale', p_property_id, p_property_name, now());
  END IF;

  -- Send notification
  INSERT INTO notifications (id, user_id, type, title, message, read, created_at)
  VALUES ('notif_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6), p_user_id, 'transaction', 'Shares Sold', format('You sold %s shares of %s for $%s. Confirmation: %s', p_shares, p_property_name, p_net_proceeds::text, p_confirmation_number), false, now());

  DECLARE v_new_available numeric;
  BEGIN
    SELECT available INTO v_new_available FROM wallets WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'success', true,
      'transaction_id', p_transaction_id,
      'holding_id', v_holding.id,
      'confirmation_number', p_confirmation_number,
      'message', format('Successfully sold %s shares of %s. $%s credited to wallet.', p_shares, p_property_name, p_net_proceeds::text),
      'new_balance', COALESCE(v_new_available, 0),
      'remaining_shares', v_remaining_shares
    );
  END;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'transaction_id', '',
    'holding_id', '',
    'confirmation_number', '',
    'message', SQLERRM,
    'new_balance', 0,
    'remaining_shares', 0
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ATOMIC WALLET OPERATION: Deposit/withdrawal/dividend with row-level locking
CREATE OR REPLACE FUNCTION public.atomic_wallet_operation(
  p_user_id uuid,
  p_amount numeric,
  p_operation text, -- 'credit' or 'debit'
  p_reason text,
  p_description text,
  p_reference_id text DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_fee numeric DEFAULT 0
) RETURNS jsonb AS $fn$
DECLARE
  v_wallet record;
  v_new_available numeric;
  v_new_invested numeric;
  v_new_total numeric;
  v_tx_id text;
  v_is_investment boolean;
BEGIN
  v_tx_id := 'wtx_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 8);
  v_is_investment := (p_reason IN ('investment', 'resale_purchase'));

  -- Lock wallet row
  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, available, pending, invested, total, currency)
    VALUES (p_user_id, 0, 0, 0, 0, 'USD');
    SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id;
  END IF;

  IF p_operation = 'debit' THEN
    IF v_wallet.available < p_amount THEN
      RETURN jsonb_build_object(
        'success', false,
        'new_available', v_wallet.available,
        'new_invested', v_wallet.invested,
        'new_total', v_wallet.total,
        'message', format('Insufficient balance: $%s available, $%s required', v_wallet.available::text, p_amount::text),
        'transaction_id', ''
      );
    END IF;

    v_new_available := GREATEST(0, v_wallet.available - p_amount);
    v_new_invested := CASE WHEN v_is_investment THEN v_wallet.invested + p_amount ELSE v_wallet.invested END;
    v_new_total := v_new_available + v_new_invested + v_wallet.pending;
  ELSE
    v_new_available := v_wallet.available + p_amount;
    v_new_invested := v_wallet.invested;
    v_new_total := v_new_available + v_new_invested + v_wallet.pending;
  END IF;

  UPDATE wallets SET
    available = v_new_available,
    invested = v_new_invested,
    total = v_new_total,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Record wallet transaction
  BEGIN
    INSERT INTO wallet_transactions (id, user_id, type, amount, direction, status, reference_id, reference_type, description, fee, net_amount, created_at)
    VALUES (v_tx_id, p_user_id, p_reason, p_amount, p_operation, 'completed', p_reference_id, p_reference_type, p_description, p_fee, p_amount - p_fee, now());
  EXCEPTION WHEN undefined_table THEN
    INSERT INTO transactions (id, user_id, type, amount, status, description, created_at)
    VALUES (v_tx_id, p_user_id, p_reason, CASE WHEN p_operation = 'debit' THEN -p_amount ELSE p_amount END, 'completed', p_description, now());
  END;

  RETURN jsonb_build_object(
    'success', true,
    'new_available', v_new_available,
    'new_invested', v_new_invested,
    'new_total', v_new_total,
    'message', format('Wallet %s: $%s %s', p_operation, p_amount::text, p_reason),
    'transaction_id', v_tx_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'new_available', 0,
    'new_invested', 0,
    'new_total', 0,
    'message', SQLERRM,
    'transaction_id', ''
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 18. VERIFY
DO $$
DECLARE
  _tables text[] := ARRAY['profiles','wallets','properties','market_data','holdings','transactions','notifications','analytics_events','image_registry','push_tokens','jv_deals','landing_analytics','waitlist'];
  _t text; _count integer := 0;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=_t AND table_schema='public') THEN _count:=_count+1;
    ELSE RAISE NOTICE 'MISSING: %', _t; END IF;
  END LOOP;
  RAISE NOTICE 'Tables: % / 13 created', _count;
  IF _count=13 THEN RAISE NOTICE 'ALL TABLES READY'; END IF;
END $$;
`;

export const VERIFY_SQL = `-- IVXHOLDINGS GO-LIVE VERIFICATION
DO $ DECLARE _t text; _ok int:=0; _tables text[]:=ARRAY['profiles','wallets','properties','market_data','holdings','transactions','notifications','analytics_events','image_registry','push_tokens','jv_deals','landing_analytics','waitlist','resale_listings','wallet_transactions'];
BEGIN
  RAISE NOTICE '=== TABLE CHECK ===';
  FOREACH _t IN ARRAY _tables LOOP
    IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=_t AND table_schema='public') THEN _ok:=_ok+1; RAISE NOTICE '[OK] %', _t;
    ELSE RAISE NOTICE '[MISS] %', _t; END IF;
  END LOOP;
  RAISE NOTICE 'Tables: % / 15', _ok;
END $;

DO $ DECLARE _t text; _ok int:=0; _tables text[]:=ARRAY['profiles','wallets','properties','market_data','holdings','transactions','notifications','analytics_events','image_registry','push_tokens','jv_deals','landing_analytics','waitlist','resale_listings','wallet_transactions'];
BEGIN
  RAISE NOTICE '=== RLS CHECK ===';
  FOREACH _t IN ARRAY _tables LOOP
    IF (SELECT relrowsecurity FROM pg_class WHERE relname=_t AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) THEN _ok:=_ok+1; RAISE NOTICE '[OK] % RLS', _t;
    ELSE RAISE NOTICE '[WARN] % NO RLS', _t; END IF;
  END LOOP;
  RAISE NOTICE 'RLS: % / 15', _ok;
END $;

DO $$ BEGIN
  RAISE NOTICE '=== REALTIME CHECK ===';
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='jv_deals') THEN RAISE NOTICE '[OK] jv_deals realtime enabled';
  ELSE RAISE NOTICE '[FAIL] jv_deals NOT in realtime'; END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '=== FUNCTIONS CHECK ===';
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='is_admin') THEN RAISE NOTICE '[OK] is_admin()'; ELSE RAISE NOTICE '[FAIL] is_admin() missing'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='set_updated_at') THEN RAISE NOTICE '[OK] set_updated_at()'; ELSE RAISE NOTICE '[FAIL] set_updated_at() missing'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='handle_new_user') THEN RAISE NOTICE '[OK] handle_new_user()'; ELSE RAISE NOTICE '[FAIL] handle_new_user() missing'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='atomic_purchase_shares') THEN RAISE NOTICE '[OK] atomic_purchase_shares()'; ELSE RAISE NOTICE '[FAIL] atomic_purchase_shares() missing'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='atomic_sell_shares') THEN RAISE NOTICE '[OK] atomic_sell_shares()'; ELSE RAISE NOTICE '[FAIL] atomic_sell_shares() missing'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='atomic_wallet_operation') THEN RAISE NOTICE '[OK] atomic_wallet_operation()'; ELSE RAISE NOTICE '[FAIL] atomic_wallet_operation() missing'; END IF;
END $;

DO $$ BEGIN
  RAISE NOTICE '=== AUTH TRIGGER CHECK ===';
  IF EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name='on_auth_user_created' AND event_object_table='users' AND trigger_schema='auth') THEN RAISE NOTICE '[OK] on_auth_user_created trigger';
  ELSE RAISE NOTICE '[FAIL] on_auth_user_created missing'; END IF;
END $$;

RAISE NOTICE '=== VERIFICATION COMPLETE ===';
`;

export const SEND_EMAIL_FUNCTION_CODE = `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") ?? "noreply@ivxholding.com";
const FROM_NAME = "IVX Holdings";

interface EmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload: EmailPayload = await req.json();
    if (!payload.to || !payload.subject) {
      return new Response(JSON.stringify({ error: "Missing to or subject" }), { status: 400 });
    }

    if (!SENDGRID_API_KEY) {
      console.log("[send-email] No SENDGRID_API_KEY set, logging email:", payload.to, payload.subject);
      return new Response(JSON.stringify({ success: true, mode: "dry-run" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const sgPayload = {
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: payload.subject,
      content: [
        payload.html
          ? { type: "text/html", value: payload.html }
          : { type: "text/plain", value: payload.text || "" },
      ],
      ...(payload.replyTo ? { reply_to: { email: payload.replyTo } } : {}),
    };

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + SENDGRID_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sgPayload),
    });

    if (res.status >= 200 && res.status < 300) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const errorBody = await res.text();
    console.log("[send-email] SendGrid error:", res.status, errorBody);
    return new Response(JSON.stringify({ error: "SendGrid error", status: res.status }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("[send-email] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
`;
