/**
 * REAL LIVE AUDIT — Part 2.
 * Sign in as owner via Supabase to get a bearer token, then ask Owner AI live
 * "how many members" and "how many visitors from day one" to catch the hallucination.
 * Also query the members table with different selects to find the 400 cause.
 */
const SUPABASE_URL = 'https://kvclcdjmjghndxsngfzb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE5NDAyNywiZXhwIjoyMDg4NzcwMDI3fQ.TaTRyViK-8sv3R_g1Me08sEjnyMskGXKF0u-I-PTaQ8';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk';
const BACKEND = 'https://api.ivxholding.com';
const OWNER_TOKEN = 'b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b';
const OWNER_EMAIL = 'Iperez4242@gmail.com';
const OWNER_PASSWORD = 'X146corp@1x146corp$$1';

const svcHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: 'application/json' };

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  const data = await res.json();
  return { status: res.status, accessToken: data.access_token || null, error: data.error || null };
}

async function askOwnerAI(message, bearer) {
  const res = await fetch(`${BACKEND}/api/ivx/owner-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ivx-owner-token': OWNER_TOKEN, Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ message }),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 2000) };
}

async function queryMembers() {
  // Try different selects to find the 400 cause
  const attempts = [
    'id',
    'id,email,created_at',
    '*',
  ];
  const results = [];
  for (const sel of attempts) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/members?select=${encodeURIComponent(sel)}&limit=50`, { headers: svcHeaders });
      const text = await res.text();
      results.push({ select: sel, status: res.status, body: text.slice(0, 400) });
    } catch (e) {
      results.push({ select: sel, error: e.message });
    }
  }
  return results;
}

async function getMembersSchema() {
  // Use the OpenAPI spec to get column definitions
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: svcHeaders });
    const data = await res.json();
    const membersDef = data.definitions && data.definitions.members;
    return { status: res.status, membersSchema: membersDef || 'NOT_FOUND_IN_OPENAPI' };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const out = {};
  out.timestamp = new Date().toISOString();

  // 1. Sign in as owner
  out.signIn = await signIn();
  const bearer = out.signIn.accessToken;

  if (bearer) {
    // 2. Ask Owner AI live
    out.ownerAI_howManyMembers = await askOwnerAI('How many members do we have on the platform right now?', bearer);
    out.ownerAI_howManyVisitors = await askOwnerAI('How many visitors has the landing page had from day one to now?', bearer);
    out.ownerAI_1050members = await askOwnerAI('IVX IA found 1050 members and waitlist. Is that real?', bearer);
  } else {
    out.ownerAI = 'SIGN_IN_FAILED — no bearer token';
  }

  // 3. Members table schema
  out.membersSchema = await getMembersSchema();
  out.membersQueries = await queryMembers();

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
