import fs from 'node:fs';

// Load expo/.env
const env = {};
for (const line of fs.readFileSync('expo/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.EXPO_PUBLIC_OWNER_EMAIL || env.IVX_OWNER_REGISTRATION_EMAILS.split(',')[0];
const PASSWORD = env.OWNER_NEW_PASSWORD;
const API = (env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/$/, '');

console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('API:', API);
console.log('OWNER EMAIL:', EMAIL.replace(/(.{3}).*(@.*)/, '$1***$2'));

async function main() {
  // 1) Sign in to Supabase -> real JWT
  const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const auth = await signIn.json();
  console.log('\n=== STEP 1: Supabase sign-in ===');
  console.log('HTTP', signIn.status);
  if (!signIn.ok) {
    console.log('Sign-in body:', JSON.stringify(auth).slice(0, 400));
    return;
  }
  const jwt = auth.access_token;
  const parts = (jwt || '').split('.').length;
  console.log('access_token parts:', parts, '(3 = valid Supabase JWT)');
  console.log('user email:', auth.user?.email);
  console.log('user id:', auth.user?.id);

  const bearer = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  // 2) Health
  const health = await fetch(`${API}/health`).then((r) => r.json()).catch((e) => ({ err: String(e) }));
  console.log('\n=== STEP 2: Production health ===');
  console.log('commit:', health.commit, '| bootTime:', health.bootTime, '| aiEnabled:', health.aiEnabled);

  // 3) Senior Developer credential audit (real owner bearer)
  console.log('\n=== STEP 3: Senior Developer credential audit ===');
  const credRes = await fetch(`${API}/api/ivx/senior-developer/credential-audit`, { headers: bearer });
  const cred = await credRes.json();
  console.log('HTTP', credRes.status, '| ok:', cred.ok);
  console.log('ownerApproval:', JSON.stringify(cred.ownerApproval));
  console.log('audit:', JSON.stringify(cred.audit).slice(0, 600));
  if (cred.exactBlocker) console.log('blocker:', cred.exactBlocker);

  // 4) GitHub audit
  console.log('\n=== STEP 4: Senior Developer GitHub audit ===');
  const ghRes = await fetch(`${API}/api/ivx/senior-developer/github-audit`, { headers: bearer });
  const gh = await ghRes.json();
  console.log('HTTP', ghRes.status, '| ok:', gh.ok);
  console.log('github:', JSON.stringify(gh.github).slice(0, 500));

  // 5) Senior Developer RUN (real engineering task, validation only - no git deploy)
  console.log('\n=== STEP 5: Senior Developer RUN (validation task) ===');
  const runRes = await fetch(`${API}/api/ivx/senior-developer/run`, {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify({
      goal: 'Verify IVX senior developer runtime end-to-end: typecheck the backend and report production health.',
      validationMode: 'focused',
      approvePatch: false,
      approveGitDeploy: false,
    }),
  });
  const run = await runRes.json();
  console.log('HTTP', runRes.status, '| ok:', run.ok);
  console.log('proof:', JSON.stringify(run.proof, null, 2)?.slice(0, 1200));
  if (run.result) console.log('result summary:', JSON.stringify(run.result).slice(0, 1200));
  if (run.exactBlocker || run.proof?.exactBlocker) console.log('blocker:', run.exactBlocker || run.proof?.exactBlocker);
}

main().catch((e) => console.log('FATAL', String(e)));
