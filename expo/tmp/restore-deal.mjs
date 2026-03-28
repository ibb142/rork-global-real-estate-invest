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

console.log('Supabase URL:', SUPABASE_URL);
console.log('Key present:', !!SUPABASE_KEY);

// Step 1: Check if deal exists
console.log('\n--- Checking if CASA ROSARIO exists ---');
const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/jv_deals?or=(name.ilike.%25CASA ROSARIO%25,title.ilike.%25CASA ROSARIO%25)&select=id,name,title,status,published,is_published`, {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  },
});
const existing = await checkRes.json();
console.log('Existing deals found:', JSON.stringify(existing, null, 2));

if (existing.length > 0) {
  // Deal exists — update it to make sure it's active and published
  const dealId = existing[0].id;
  console.log(`\n--- Deal found (id: ${dealId}), updating to active/published ---`);
  
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/jv_deals?id=eq.${dealId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      title: 'CASA ROSARIO',
      name: 'CASA ROSARIO',
      project_name: 'ONE STOP DEVELOPMENT TWO LLC',
      type: 'development',
      description: 'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
      property_address: '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
      city: 'Pembroke Pines',
      state: 'FL',
      country: 'USA',
      total_investment: 1400000,
      expected_roi: 30,
      distribution_frequency: 'Quarterly',
      exit_strategy: 'Sale upon completion',
      status: 'active',
      published: true,
      is_published: true,
      updated_at: new Date().toISOString(),
    }),
  });
  
  const updateData = await updateRes.json();
  console.log('Update status:', updateRes.status);
  console.log('Updated deal:', JSON.stringify(updateData, null, 2));
} else {
  // Deal doesn't exist — insert it
  console.log('\n--- Deal NOT found, inserting new ---');
  
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/jv_deals`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: 'casa-rosario-001',
      name: 'CASA ROSARIO',
      title: 'CASA ROSARIO',
      project_name: 'ONE STOP DEVELOPMENT TWO LLC',
      type: 'development',
      description: 'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI. Located in the highly desirable Pembroke Pines area of South Florida.',
      partner_name: 'ONE STOP DEVELOPMENT TWO LLC',
      partner_type: 'developer',
      property_address: '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
      city: 'Pembroke Pines',
      state: 'FL',
      zip_code: '33332',
      country: 'US',
      property_type: 'Residential',
      total_investment: 1400000,
      amount: 1400000,
      expected_roi: 30,
      estimated_value: 1820000,
      term_months: 24,
      distribution_frequency: 'Quarterly',
      exit_strategy: 'Sale upon completion',
      status: 'active',
      published: true,
      is_published: true,
      published_at: new Date().toISOString(),
      currency: 'USD',
      profit_split: '70/30 Developer/Investor',
      partners: [{"name": "ONE STOP DEVELOPMENT TWO LLC", "role": "Developer", "share": 70}],
      photos: [],
    }),
  });
  
  const insertData = await insertRes.json();
  console.log('Insert status:', insertRes.status);
  console.log('Inserted deal:', JSON.stringify(insertData, null, 2));
}

// Step 2: Verify deal is visible
console.log('\n--- VERIFICATION: Checking published deals ---');
const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/jv_deals?select=id,name,title,status,published,is_published,total_investment,city,state,expected_roi&or=(is_published.eq.true,published.eq.true)&limit=10`, {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  },
});
const verifyData = await verifyRes.json();
console.log('All published deals:', JSON.stringify(verifyData, null, 2));

// Also sync to landing_deals
console.log('\n--- Syncing to landing_deals ---');
const landingCheck = await fetch(`${SUPABASE_URL}/rest/v1/landing_deals?id=eq.casa-rosario-001&select=id`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
const landingExisting = await landingCheck.json();

if (landingExisting.length > 0) {
  const landingUpdate = await fetch(`${SUPABASE_URL}/rest/v1/landing_deals?id=eq.casa-rosario-001`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      title: 'CASA ROSARIO',
      project_name: 'ONE STOP DEVELOPMENT TWO LLC',
      status: 'active',
      total_investment: 1400000,
      expected_roi: 30,
      updated_at: new Date().toISOString(),
    }),
  });
  console.log('Landing deal update status:', landingUpdate.status);
} else {
  const landingInsert = await fetch(`${SUPABASE_URL}/rest/v1/landing_deals`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: 'casa-rosario-001',
      title: 'CASA ROSARIO',
      project_name: 'ONE STOP DEVELOPMENT TWO LLC',
      description: 'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for investment with 30% expected ROI.',
      property_address: '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
      city: 'Pembroke Pines',
      state: 'FL',
      country: 'US',
      total_investment: 1400000,
      expected_roi: 30,
      status: 'active',
      photos: [],
      distribution_frequency: 'Quarterly',
      exit_strategy: 'Sale upon completion',
      published_at: new Date().toISOString(),
    }),
  });
  console.log('Landing deal insert status:', landingInsert.status);
}

console.log('\n✅ DONE — Casa Rosario deal restored');
