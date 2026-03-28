import postgres from 'postgres';
import { readFileSync } from 'fs';

const envContent = readFileSync('/home/user/rork-app/.env', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
}

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DB_PASSWORD = env.SUPABASE_DB_PASSWORD;
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

const connectionStrings = [
  `postgresql://postgres:${DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`,
  `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres:${DB_PASSWORD}@db.${projectRef}.supabase.co:6543/postgres`,
  `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
];

let sql = null;

for (const connStr of connectionStrings) {
  const safe = connStr.replace(DB_PASSWORD, '***');
  console.log('Trying:', safe);
  try {
    const testSql = postgres(connStr, { ssl: 'require', connect_timeout: 10, idle_timeout: 5 });
    const result = await testSql`SELECT 1 as ok`;
    if (result[0]?.ok === 1) {
      console.log('✅ Connected!');
      sql = testSql;
      break;
    }
    await testSql.end();
  } catch (err) {
    console.log('❌', err.message.substring(0, 80));
  }
}

if (!sql) {
  console.log('\n❌ All connection strings failed. Generating SQL for manual paste.\n');
  
  const sqlText = `-- =============================================
-- RUN THIS IN SUPABASE SQL EDITOR (Dashboard > SQL Editor > New Query)
-- Just paste ALL of this and click "Run"
-- =============================================

ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS project_name text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS type text DEFAULT 'development';
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS property_address text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS total_investment numeric DEFAULT 0;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS expected_roi numeric DEFAULT 0;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS distribution_frequency text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS exit_strategy text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partners jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS pool_tiers jsonb;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_email text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_phone text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_type text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS lot_size text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS lot_size_unit text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS zoning text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS property_type text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS estimated_value numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS appraised_value numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS cash_payment_percent numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS collateral_percent numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_profit_share numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS developer_profit_share numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS term_months integer;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS cash_payment_amount numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS collateral_amount numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS payment_structure text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS profit_split text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS end_date text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS governing_law text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS dispute_resolution text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS confidentiality_period text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS non_compete_period text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS management_fee numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS performance_fee numeric;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS minimum_hold_period text;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS control_disclosure_accepted boolean DEFAULT false;
ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS control_disclosure_accepted_at timestamptz;

-- Update existing Casa Rosario deal with full data
UPDATE public.jv_deals SET
  title = 'CASA ROSARIO',
  project_name = 'ONE STOP DEVELOPMENT TWO LLC',
  type = 'development',
  property_address = '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
  city = 'Pembroke Pines',
  state = 'FL',
  country = 'USA',
  total_investment = 1400000,
  expected_roi = 30,
  distribution_frequency = 'Quarterly',
  exit_strategy = 'Sale upon completion',
  status = 'active',
  published = true,
  partners = '[{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}]'::jsonb,
  updated_at = NOW()
WHERE UPPER(name) LIKE '%CASA ROSARIO%';

-- Create landing_deals table
CREATE TABLE IF NOT EXISTS public.landing_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  project_name text,
  description text,
  property_address text,
  city text,
  state text,
  country text,
  total_investment numeric DEFAULT 0,
  expected_roi numeric DEFAULT 0,
  status text DEFAULT 'active',
  photos jsonb DEFAULT '[]'::jsonb,
  distribution_frequency text,
  exit_strategy text,
  published_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  synced_at timestamptz DEFAULT now()
);

-- RLS policies
ALTER TABLE public.landing_deals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY landing_deals_select_all ON public.landing_deals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY landing_deals_insert_all ON public.landing_deals FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY landing_deals_update_all ON public.landing_deals FOR UPDATE USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.jv_deals;

SELECT 'ALL DONE - Your jv_deals table now has all required columns!' as result;`;

  console.log(sqlText);
  process.exit(0);
}

// If we got here, we have a working connection
console.log('\n========== ADDING MISSING COLUMNS ==========\n');

const alterStatements = [
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS title text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS project_name text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS type text DEFAULT 'development'`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS published boolean DEFAULT false`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS property_address text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS city text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS state text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS country text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS zip_code text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS total_investment numeric DEFAULT 0`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS expected_roi numeric DEFAULT 0`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS distribution_frequency text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS exit_strategy text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partners jsonb DEFAULT '[]'::jsonb`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS pool_tiers jsonb`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS notes text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS user_id uuid`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_name text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_email text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_phone text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_type text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS lot_size text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS lot_size_unit text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS zoning text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS property_type text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS estimated_value numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS appraised_value numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS cash_payment_percent numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS collateral_percent numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS partner_profit_share numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS developer_profit_share numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS term_months integer`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS cash_payment_amount numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS collateral_amount numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS rejection_reason text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS payment_structure text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD'`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS profit_split text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS start_date text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS end_date text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS governing_law text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS dispute_resolution text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS confidentiality_period text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS non_compete_period text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS management_fee numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS performance_fee numeric`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS minimum_hold_period text`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS submitted_at timestamptz`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS approved_at timestamptz`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS completed_at timestamptz`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS control_disclosure_accepted boolean DEFAULT false`,
  `ALTER TABLE public.jv_deals ADD COLUMN IF NOT EXISTS control_disclosure_accepted_at timestamptz`,
];

let ok = 0;
let fail = 0;
for (const stmt of alterStatements) {
  try {
    await sql.unsafe(stmt);
    ok++;
  } catch (err) {
    fail++;
    console.log('Error:', err.message.substring(0, 100));
  }
}
console.log(`Columns: ${ok} ok, ${fail} failed`);

console.log('\n========== UPDATING CASA ROSARIO ==========\n');
try {
  await sql.unsafe(`
    UPDATE public.jv_deals SET
      title = 'CASA ROSARIO',
      project_name = 'ONE STOP DEVELOPMENT TWO LLC',
      type = 'development',
      property_address = '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
      city = 'Pembroke Pines',
      state = 'FL',
      country = 'USA',
      total_investment = 1400000,
      expected_roi = 30,
      distribution_frequency = 'Quarterly',
      exit_strategy = 'Sale upon completion',
      status = 'active',
      published = true,
      partners = '[{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}]'::jsonb,
      updated_at = NOW()
    WHERE UPPER(name) LIKE '%CASA ROSARIO%'
  `);
  console.log('✅ Casa Rosario updated');
} catch (err) {
  console.log('Update error:', err.message);
}

console.log('\n========== CREATING LANDING_DEALS TABLE ==========\n');
try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.landing_deals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text, project_name text, description text, property_address text,
      city text, state text, country text, total_investment numeric DEFAULT 0,
      expected_roi numeric DEFAULT 0, status text DEFAULT 'active',
      photos jsonb DEFAULT '[]'::jsonb, distribution_frequency text,
      exit_strategy text, published_at timestamptz,
      updated_at timestamptz DEFAULT now(), synced_at timestamptz DEFAULT now()
    )
  `);
  await sql.unsafe(`ALTER TABLE public.landing_deals ENABLE ROW LEVEL SECURITY`);
  await sql.unsafe(`DO $$ BEGIN CREATE POLICY landing_deals_select_all ON public.landing_deals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await sql.unsafe(`DO $$ BEGIN CREATE POLICY landing_deals_insert_all ON public.landing_deals FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await sql.unsafe(`DO $$ BEGIN CREATE POLICY landing_deals_update_all ON public.landing_deals FOR UPDATE USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  console.log('✅ landing_deals table ready');
} catch (err) {
  console.log('landing_deals error:', err.message.substring(0, 100));
}

try {
  await sql.unsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE public.jv_deals`);
  console.log('✅ Realtime enabled');
} catch (err) {
  if (err.message.includes('already member')) console.log('✅ Realtime already enabled');
  else console.log('Realtime note:', err.message.substring(0, 80));
}

console.log('\n========== VERIFY ==========\n');
try {
  const rows = await sql`SELECT id, name, title, status, published, is_published, total_investment, city, state, expected_roi FROM public.jv_deals LIMIT 5`;
  console.log('Deals in DB:', rows.length);
  for (const r of rows) {
    console.log(' -', r.name || r.title, '| status:', r.status, '| published:', r.published, '| city:', r.city, '| investment:', r.total_investment);
  }
} catch (err) {
  console.log('Verify error:', err.message);
}

await sql.end();

console.log('\n========== VERIFY VIA REST API ==========\n');
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jv_deals?select=id,name,title,status,published,is_published,total_investment,city,state,expected_roi&limit=5`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const data = await res.json();
  console.log('REST API:', res.status, '|', Array.isArray(data) ? data.length + ' deals' : JSON.stringify(data).substring(0, 200));
  if (Array.isArray(data)) {
    for (const d of data) {
      console.log(' -', d.name || d.title, '| status:', d.status, '| published:', d.published, '| city:', d.city);
    }
  }
} catch (err) {
  console.log('REST error:', err.message);
}
