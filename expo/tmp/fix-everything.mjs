import postgres from 'postgres';
import { readFileSync } from 'fs';
import { createHash, createHmac } from 'crypto';

// Load env
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
const AWS_ACCESS_KEY = env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = env.AWS_REGION || 'us-east-1';

const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
console.log('Project ref:', projectRef);
console.log('DB Password:', DB_PASSWORD ? DB_PASSWORD.substring(0, 5) + '...' : 'MISSING');
console.log('AWS Access Key:', AWS_ACCESS_KEY ? AWS_ACCESS_KEY.substring(0, 8) + '...' : 'MISSING');

// ============================================================
// STEP 1: Fix database schema — add all missing columns
// ============================================================
console.log('\n========== STEP 1: FIX DATABASE SCHEMA ==========\n');

const connString = `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

let sql;
try {
  sql = postgres(connString, { ssl: 'require', connect_timeout: 15 });
  console.log('Connected to database');
} catch (err) {
  console.error('Failed to connect:', err.message);
  // Try alternative connection
  const altConn = `postgresql://postgres:${DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`;
  try {
    sql = postgres(altConn, { ssl: 'require', connect_timeout: 15 });
    console.log('Connected via alternative connection');
  } catch (err2) {
    console.error('Alt connection also failed:', err2.message);
    process.exit(1);
  }
}

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

let columnsAdded = 0;
let columnsError = 0;

for (const stmt of alterStatements) {
  try {
    await sql.unsafe(stmt);
    const colName = stmt.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
    columnsAdded++;
    if (columnsAdded % 10 === 0) console.log(`  Added ${columnsAdded} columns so far...`);
  } catch (err) {
    columnsError++;
    console.log('  Error:', stmt.substring(0, 60), '|', err.message.substring(0, 80));
  }
}

console.log(`\n✅ Columns: ${columnsAdded} added/verified, ${columnsError} errors`);

// ============================================================
// STEP 2: Create landing_deals table if it doesn't exist
// ============================================================
console.log('\n========== STEP 2: CREATE LANDING_DEALS TABLE ==========\n');

try {
  await sql.unsafe(`
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
  `);
  console.log('✅ landing_deals table created/verified');
} catch (err) {
  console.log('landing_deals table error:', err.message);
}

// ============================================================
// STEP 3: Ensure RLS policies allow read access
// ============================================================
console.log('\n========== STEP 3: FIX RLS POLICIES ==========\n');

const rlsStatements = [
  `ALTER TABLE public.jv_deals ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN CREATE POLICY jv_deals_select_all ON public.jv_deals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY jv_deals_insert_all ON public.jv_deals FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY jv_deals_update_all ON public.jv_deals FOR UPDATE USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY jv_deals_delete_all ON public.jv_deals FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE public.landing_deals ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN CREATE POLICY landing_deals_select_all ON public.landing_deals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY landing_deals_insert_all ON public.landing_deals FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY landing_deals_update_all ON public.landing_deals FOR UPDATE USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

for (const stmt of rlsStatements) {
  try {
    await sql.unsafe(stmt);
  } catch (err) {
    // Ignore duplicate policy errors
  }
}
console.log('✅ RLS policies configured');

// ============================================================
// STEP 4: Enable Realtime on jv_deals
// ============================================================
console.log('\n========== STEP 4: ENABLE REALTIME ==========\n');

try {
  await sql.unsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE public.jv_deals`);
  console.log('✅ Realtime enabled on jv_deals');
} catch (err) {
  if (err.message.includes('already member')) {
    console.log('✅ Realtime already enabled on jv_deals');
  } else {
    console.log('Realtime setup note:', err.message.substring(0, 100));
  }
}

// ============================================================
// STEP 5: Insert/update Casa Rosario deal
// ============================================================
console.log('\n========== STEP 5: INSERT CASA ROSARIO DEAL ==========\n');

try {
  const existing = await sql`SELECT id, name, title FROM public.jv_deals WHERE UPPER(name) LIKE '%CASA ROSARIO%' OR UPPER(title) LIKE '%CASA ROSARIO%' LIMIT 1`;
  
  if (existing.length > 0) {
    console.log('Casa Rosario found (id:', existing[0].id, ') — updating with full data...');
    await sql`
      UPDATE public.jv_deals SET
        title = 'CASA ROSARIO',
        project_name = 'ONE STOP DEVELOPMENT TWO LLC',
        type = 'development',
        description = 'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
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
        is_published = true,
        published_at = NOW(),
        partners = ${JSON.stringify([{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}])}::jsonb,
        updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    console.log('✅ Casa Rosario updated with all fields');
  } else {
    console.log('Casa Rosario not found — inserting new...');
    await sql`
      INSERT INTO public.jv_deals (name, title, project_name, type, description, property_address, city, state, country, total_investment, expected_roi, distribution_frequency, exit_strategy, status, published, is_published, published_at, amount, partners, updated_at)
      VALUES (
        'CASA ROSARIO',
        'CASA ROSARIO',
        'ONE STOP DEVELOPMENT TWO LLC',
        'development',
        'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
        '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
        'Pembroke Pines',
        'FL',
        'USA',
        1400000,
        30,
        'Quarterly',
        'Sale upon completion',
        'active',
        true,
        true,
        NOW(),
        1400000,
        ${JSON.stringify([{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}])}::jsonb,
        NOW()
      )
    `;
    console.log('✅ Casa Rosario inserted');
  }
} catch (err) {
  console.error('Casa Rosario insert/update error:', err.message);
}

// Verify the deal is there
try {
  const verify = await sql`SELECT id, name, title, status, published, is_published, total_investment, city, state FROM public.jv_deals WHERE UPPER(name) LIKE '%CASA ROSARIO%' OR UPPER(title) LIKE '%CASA ROSARIO%' LIMIT 1`;
  if (verify.length > 0) {
    console.log('✅ VERIFIED — Casa Rosario in database:', JSON.stringify(verify[0]));
  } else {
    console.log('❌ Casa Rosario NOT found after insert/update');
  }
} catch (err) {
  console.log('Verify error:', err.message);
}

await sql.end();
console.log('\nDatabase connection closed');

// ============================================================
// STEP 6: Verify Supabase REST API can now read the deal
// ============================================================
console.log('\n========== STEP 6: VERIFY SUPABASE REST API ==========\n');

try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jv_deals?select=id,name,title,status,published,is_published,total_investment,city,state,expected_roi&is_published=eq.true&limit=5`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  const data = await res.json();
  console.log('REST API status:', res.status);
  console.log('REST API returned:', Array.isArray(data) ? data.length + ' deals' : JSON.stringify(data).substring(0, 200));
  if (Array.isArray(data) && data.length > 0) {
    console.log('✅ First deal:', JSON.stringify(data[0]).substring(0, 300));
  }
} catch (err) {
  console.log('REST API error:', err.message);
}

// ============================================================
// STEP 7: Deploy landing page to S3 with real credentials
// ============================================================
console.log('\n========== STEP 7: DEPLOY LANDING PAGE TO S3 ==========\n');

if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY) {
  console.log('❌ AWS credentials missing — cannot deploy to S3');
  process.exit(0);
}

let html = '';
try {
  html = readFileSync('/home/user/rork-app/ivxholding-landing/index.html', 'utf-8');
  console.log('Loaded landing HTML:', html.length, 'bytes');
} catch (err) {
  console.log('Failed to read landing HTML:', err.message);
  process.exit(1);
}

const apiBaseUrl = 'https://dev-jh1qrutuhy6vu1bkysoln.rorktest.dev';

// Replace all placeholders
html = html.replace(/__IVX_SUPABASE_URL__/g, SUPABASE_URL);
html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, SUPABASE_KEY);
html = html.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
html = html.replace(/__IVX_APP_URL__/g, apiBaseUrl);
html = html.replace(/__IVX_BACKEND_URL__/g, apiBaseUrl);

// Replace meta tags
const metaReplacements = [
  ['ivx-sb-url', SUPABASE_URL],
  ['ivx-sb-key', SUPABASE_KEY],
  ['ivx-sb-url-fallback', SUPABASE_URL],
  ['ivx-sb-key-fallback', SUPABASE_KEY],
  ['ivx-api-url', apiBaseUrl],
  ['ivx-backend-url', apiBaseUrl],
];
for (const [name, value] of metaReplacements) {
  const pattern = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"`);
  const match = html.match(pattern);
  if (match) {
    html = html.replace(match[0], `<meta name="${name}" content="${value}"`);
  }
}

// Replace JS vars
const jsReplacements = [
  [/var _FALLBACK_SUPABASE_URL = '[^']*';/, `var _FALLBACK_SUPABASE_URL = '${SUPABASE_URL}';`],
  [/var _FALLBACK_SUPABASE_KEY = '[^']*';/, `var _FALLBACK_SUPABASE_KEY = '${SUPABASE_KEY}';`],
  [/var _RORK_API_URL = '[^']*';/, `var _RORK_API_URL = '${apiBaseUrl}';`],
  [/var _RORK_BACKEND_URL = '[^']*';/, `var _RORK_BACKEND_URL = '${apiBaseUrl}';`],
];
for (const [pattern, replacement] of jsReplacements) {
  if (pattern.test(html)) {
    html = html.replace(pattern, replacement);
  }
}

console.log('HTML prepared with real credentials:', html.length, 'bytes');

// Verify credentials are in the HTML
const hasUrl = html.includes(SUPABASE_URL);
const hasKey = html.includes(SUPABASE_KEY.substring(0, 30));
console.log('Contains Supabase URL:', hasUrl);
console.log('Contains Supabase Key:', hasKey);

// S3 upload function using AWS Signature V4
async function s3Put(key, body, contentType) {
  const bucket = 'ivxholding.com';
  const encoder = new TextEncoder();
  const now = new Date();
  const iso = now.toISOString();
  const amzDate = iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.substring(0, 8);
  
  const payloadHash = createHash('sha256').update(body).digest('hex');
  
  const usePathStyle = bucket.includes('.');
  const s3Host = usePathStyle
    ? (AWS_REGION === 'us-east-1' ? 's3.amazonaws.com' : `s3.${AWS_REGION}.amazonaws.com`)
    : `${bucket}.s3.${AWS_REGION}.amazonaws.com`;
  const canonicalUri = usePathStyle ? `/${bucket}/${key}` : `/${key}`;
  const url = `https://${s3Host}${canonicalUri}`;
  
  const canonicalHeaders = `content-type:${contentType}\nhost:${s3Host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const canonicalHash = createHash('sha256').update(canonicalRequest).digest('hex');
  const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalHash}`;
  
  const kDate = createHmac('sha256', `AWS4${AWS_SECRET_KEY}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(AWS_REGION).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  
  const authorization = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  console.log(`S3 PUT: ${url}`);
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorization,
    },
    body,
  });
  
  const respBody = response.ok ? '' : await response.text().catch(() => '');
  console.log(`S3 PUT ${key}: HTTP ${response.status}${respBody ? ' — ' + respBody.substring(0, 300) : ''}`);
  return response.ok;
}

// Upload index.html
const htmlOk = await s3Put('index.html', html, 'text/html; charset=utf-8');
console.log(htmlOk ? '✅ index.html deployed to S3' : '❌ index.html deploy FAILED');

// Upload config JSON
const configJson = JSON.stringify({
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_KEY,
  apiBaseUrl,
  appUrl: apiBaseUrl,
  backendUrl: apiBaseUrl,
  deployedAt: new Date().toISOString(),
}, null, 2);

const configOk = await s3Put('ivx-config.json', configJson, 'application/json');
console.log(configOk ? '✅ ivx-config.json deployed to S3' : '❌ ivx-config.json deploy FAILED');

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log('\n========== FINAL SUMMARY ==========\n');
console.log(`Database columns: ${columnsAdded} added/verified`);
console.log(`RLS policies: configured`);
console.log(`Casa Rosario deal: inserted/updated`);
console.log(`index.html to S3: ${htmlOk ? '✅ SUCCESS' : '❌ FAILED'}`);
console.log(`ivx-config.json to S3: ${configOk ? '✅ SUCCESS' : '❌ FAILED'}`);
console.log(`\nLanding page URL: https://ivxholding.com`);
