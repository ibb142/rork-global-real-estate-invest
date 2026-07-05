-- =============================================================================
-- IVX HOLDINGS - Complete Supabase Database Setup
-- Run this in your Supabase SQL Editor to create all required tables
-- =============================================================================

-- LENDERS DIRECTORY
CREATE TABLE IF NOT EXISTS lenders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('public','private')),
  category TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  logo TEXT,
  description TEXT NOT NULL DEFAULT '',
  aum BIGINT NOT NULL DEFAULT 0,
  min_investment BIGINT NOT NULL DEFAULT 0,
  max_investment BIGINT NOT NULL DEFAULT 0,
  preferred_property_types TEXT[] DEFAULT '{}',
  preferred_regions TEXT[] DEFAULT '{}',
  interest_rate NUMERIC(5,2),
  ltv_min NUMERIC(5,2),
  ltv_max NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'prospect',
  last_contacted_at TIMESTAMPTZ,
  total_invested BIGINT NOT NULL DEFAULT 0,
  properties_invested INT NOT NULL DEFAULT 0,
  rating INT NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TITLE COMPANIES
CREATE TABLE IF NOT EXISTS title_companies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  assigned_properties TEXT[] DEFAULT '{}',
  completed_reviews INT NOT NULL DEFAULT 0,
  average_review_days NUMERIC(4,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TITLE COMPANY ASSIGNMENTS
CREATE TABLE IF NOT EXISTS title_company_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  property_id TEXT NOT NULL,
  property_name TEXT NOT NULL DEFAULT '',
  property_address TEXT NOT NULL DEFAULT '',
  title_company_id TEXT NOT NULL REFERENCES title_companies(id),
  title_company_name TEXT NOT NULL DEFAULT '',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'assigned',
  completed_at TIMESTAMPTZ,
  notes TEXT
);

-- TITLE DOCUMENTS
CREATE TABLE IF NOT EXISTS title_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  property_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  file_uri TEXT,
  status TEXT NOT NULL DEFAULT 'not_uploaded',
  uploaded_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_notes TEXT,
  rejection_reason TEXT,
  required BOOLEAN NOT NULL DEFAULT true
);

-- PROPERTY DOCUMENT SUBMISSIONS
CREATE TABLE IF NOT EXISTS property_document_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  property_id TEXT NOT NULL,
  property_name TEXT NOT NULL DEFAULT '',
  property_address TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  assigned_title_company_id TEXT,
  assigned_title_company_name TEXT,
  submitted_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tokenization_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TEAM MEMBERS (Admin)
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  phone TEXT,
  role_id TEXT NOT NULL DEFAULT 'role-viewer',
  role_type TEXT NOT NULL DEFAULT 'viewer',
  role_permissions TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  last_login TIMESTAMPTZ,
  invited_by TEXT,
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FEE CONFIGURATIONS
CREATE TABLE IF NOT EXISTS fee_configurations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  min_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IPX FEE CONFIGS
CREATE TABLE IF NOT EXISTS ipx_fee_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  fee_type TEXT NOT NULL,
  percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  min_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  applies_to TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BROADCAST TEMPLATES
CREATE TABLE IF NOT EXISTS broadcast_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom'
);

-- EMAIL ACCOUNTS
CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6A6A6A',
  unread_count INT NOT NULL DEFAULT 0
);

-- EMAIL TEMPLATES
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'All',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  icon_name TEXT NOT NULL DEFAULT 'Mail',
  icon_color TEXT NOT NULL DEFAULT '#6A6A6A'
);

-- EMAIL CAMPAIGNS
CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  property_name TEXT,
  template_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  total_sent INT NOT NULL DEFAULT 0,
  delivered INT NOT NULL DEFAULT 0,
  opened INT NOT NULL DEFAULT 0,
  clicked INT NOT NULL DEFAULT 0,
  replied INT NOT NULL DEFAULT 0,
  bounced INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SMTP CONFIGS
CREATE TABLE IF NOT EXISTS smtp_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  port INT NOT NULL DEFAULT 587,
  username TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  daily_limit INT NOT NULL DEFAULT 5000,
  sent_today INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  warmup_phase TEXT NOT NULL DEFAULT 'ready',
  warmup_day INT NOT NULL DEFAULT 0,
  reputation_score INT NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ,
  domain TEXT NOT NULL DEFAULT ''
);

-- EMAIL LOGS
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_name TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  recipient_company TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  campaign_name TEXT,
  smtp_server TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ
);

-- LAND PARTNER DEALS
CREATE TABLE IF NOT EXISTS land_partner_deals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_id TEXT NOT NULL DEFAULT '',
  partner_name TEXT NOT NULL DEFAULT '',
  partner_email TEXT NOT NULL DEFAULT '',
  partner_phone TEXT NOT NULL DEFAULT '',
  partner_type TEXT NOT NULL DEFAULT 'jv',
  property_address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  zip_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  lot_size NUMERIC(12,2) NOT NULL DEFAULT 0,
  lot_size_unit TEXT NOT NULL DEFAULT 'sqft',
  zoning TEXT NOT NULL DEFAULT '',
  property_type TEXT NOT NULL DEFAULT 'land',
  estimated_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  appraised_value NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SOCIAL MEDIA CONTENT
CREATE TABLE IF NOT EXISTS social_media_content (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  platform TEXT NOT NULL DEFAULT 'instagram',
  content_type TEXT NOT NULL DEFAULT 'post',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  target_audience TEXT NOT NULL DEFAULT '',
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  likes INT NOT NULL DEFAULT 0,
  shares INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  impressions INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MARKETING CAMPAIGNS
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  platforms TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INFLUENCERS
CREATE TABLE IF NOT EXISTS influencers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar TEXT,
  platform TEXT NOT NULL DEFAULT 'instagram',
  handle TEXT NOT NULL DEFAULT '',
  followers INT NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'micro',
  status TEXT NOT NULL DEFAULT 'pending',
  referral_code TEXT NOT NULL DEFAULT '',
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  contract_start_date TEXT NOT NULL DEFAULT '',
  contract_end_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRACKABLE LINKS
CREATE TABLE IF NOT EXISTS trackable_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT '',
  short_code TEXT NOT NULL DEFAULT '',
  full_url TEXT NOT NULL DEFAULT '',
  qr_code_url TEXT NOT NULL DEFAULT '',
  campaign_id TEXT,
  campaign_name TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  total_clicks INT NOT NULL DEFAULT 0,
  unique_clicks INT NOT NULL DEFAULT 0,
  downloads INT NOT NULL DEFAULT 0,
  registrations INT NOT NULL DEFAULT 0,
  investments INT NOT NULL DEFAULT 0,
  investment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REFERRALS
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_id TEXT NOT NULL DEFAULT '',
  referrer_name TEXT NOT NULL DEFAULT '',
  referrer_email TEXT NOT NULL DEFAULT '',
  referred_email TEXT NOT NULL DEFAULT '',
  referred_name TEXT,
  referred_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  referral_code TEXT NOT NULL DEFAULT '',
  reward NUMERIC(12,2) NOT NULL DEFAULT 0,
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  signed_up_at TIMESTAMPTZ,
  invested_at TIMESTAMPTZ,
  investment_amount NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VIP TIERS CONFIG
CREATE TABLE IF NOT EXISTS vip_tiers (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  min_investment NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_investment NUMERIC(14,2),
  trading_fee_discount NUMERIC(5,2) NOT NULL DEFAULT 0,
  earn_apy_boost NUMERIC(5,2) NOT NULL DEFAULT 0,
  early_access_days INT NOT NULL DEFAULT 0,
  priority_support BOOLEAN NOT NULL DEFAULT false,
  exclusive_deals BOOLEAN NOT NULL DEFAULT false,
  referral_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#9A9A9A',
  accent_color TEXT NOT NULL DEFAULT '#CCCCCC',
  icon TEXT NOT NULL DEFAULT 'shield',
  perks TEXT[] DEFAULT '{}'
);

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL DEFAULT '',
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SYSTEM HEALTH CHECKS
CREATE TABLE IF NOT EXISTS system_health_checks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  service_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'up',
  response_time INT NOT NULL DEFAULT 0,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_company_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_document_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipx_fee_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_partner_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_media_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trackable_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users to read all data
-- (In production, you'd want more granular policies)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'lenders','title_companies','title_company_assignments','title_documents',
      'property_document_submissions','team_members','fee_configurations','ipx_fee_configs',
      'broadcast_templates','email_accounts','email_templates','email_campaigns',
      'smtp_configs','email_logs','land_partner_deals','social_media_content',
      'marketing_campaigns','influencers','trackable_links','referrals',
      'vip_tiers','audit_log','system_health_checks'
    ])
  LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON %I FOR SELECT TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Allow authenticated insert" ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY IF NOT EXISTS "Allow authenticated update" ON %I FOR UPDATE TO authenticated USING (true)', tbl);
  END LOOP;
END
$$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_lenders_country ON lenders(country);
CREATE INDEX IF NOT EXISTS idx_lenders_category ON lenders(category);
CREATE INDEX IF NOT EXISTS idx_lenders_status ON lenders(status);
CREATE INDEX IF NOT EXISTS idx_title_companies_status ON title_companies(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_land_partner_deals_status ON land_partner_deals(status);
CREATE INDEX IF NOT EXISTS idx_influencers_status ON influencers(status);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
