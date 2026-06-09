import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync('expo/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.EXPO_PUBLIC_OWNER_EMAIL || (env.IVX_OWNER_REGISTRATION_EMAILS || '').split(',')[0];
const PASSWORD = env.OWNER_NEW_PASSWORD;
const API = (env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/$/, '');
const CONFIRM = 'CONFIRM_IVX_GIT_DEPLOY_OPERATOR';

const log = (...a) => console.log(...a);

async function main() {
  if (!SUPABASE_URL || !ANON || !EMAIL || !PASSWORD) {
    log('MISSING CREDS', { SUPABASE_URL: !!SUPABASE_URL, ANON: !!ANON, EMAIL: !!EMAIL, PASSWORD: !!PASSWORD });
    return;
  }
  // 1) owner JWT
  const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const auth = await signIn.json();
  log('=== STEP 1: owner sign-in ===  HTTP', signIn.status);
  if (!signIn.ok) { log('sign-in body:', JSON.stringify(auth).slice(0, 400)); return; }
  const jwt = auth.access_token;
  const bearer = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  log('owner:', auth.user?.email, '| token parts:', (jwt || '').split('.').length);

  // 2) health before
  const h0 = await fetch(`${API}/health`).then(r => r.json()).catch(e => ({ err: String(e) }));
  log('\n=== STEP 2: health BEFORE ===  commit', h0.commit, '| bootTime', h0.bootTime);

  // 3) RUN with git deploy approval
  log('\n=== STEP 3: senior-developer/run (approveGitDeploy=true) ===');
  const runRes = await fetch(`${API}/api/ivx/senior-developer/run`, {
    method: 'POST',
    headers: bearer,
    body: JSON.stringify({
      goal: 'Create a new IVX Proof Module feature from scratch, commit it to GitHub, deploy to Render, and verify it live in production.',
      proposedPlan: 'Generate a new IVX Proof Module feature file + registry entry, commit it to GitHub on the production branch, trigger a Render deploy, then verify production health and the live features route.',
      filesAffected: ['backend/services/ivx-generated-features/', 'backend/services/ivx-generated-feature-registry.ts'],
      riskLevel: 'low',
      rollbackOption: 'Revert the generated-feature commit on GitHub and redeploy the previous commit on Render.',
      validationMode: 'focused',
      approvePatch: true,
      patchConfirmationText: 'CONFIRM_IVX_SAFE_CODE_PATCH',
      approveGitDeploy: true,
      gitDeployConfirmationText: CONFIRM,
    }),
  });
  const runText = await runRes.text();
  let run;
  try { run = JSON.parse(runText); } catch { run = { raw: runText.slice(0, 800) }; }
  log('HTTP', runRes.status, '| ok:', run.ok);
  log('\n--- run.proof (summary) ---');
  log(JSON.stringify(run.proof, null, 2));
  const p = run.result || run.proof || run;
  if (p && typeof p === 'object') {
    log('jobId:', p.jobId);
    log('changedFiles:', JSON.stringify(p.changedFiles));
    log('generatedFeature:', JSON.stringify(p.generatedFeature));
    const g = p.gitDeployOperator || {};
    log('\n--- GIT/DEPLOY OPERATOR ---');
    log('status:', g.status, '| reason:', g.reason);
    log('GitHub commitSha:', g.github?.commitSha);
    log('GitHub commitUrl:', g.github?.commitUrl);
    log('GitHub branch:', g.github?.branch, '| committedPaths:', JSON.stringify(g.github?.committedPaths));
    log('GitHub error:', g.github?.error);
    log('Render deployId:', g.render?.deployId, '| deployStatus:', g.render?.deployStatus);
    log('Render error:', g.render?.error);
    log('\n--- VALIDATIONS ---');
    for (const v of p.validations || []) log(' -', v.command, '| ok:', v.ok, '| err:', v.error || 'none');
    log('\n--- PRODUCTION VERIFY ---');
    log('health:', JSON.stringify(p.productionVerification));
    log('changedRoute:', JSON.stringify(p.changedRouteVerification));
    log('endToEndProductionComplete:', p.endToEndProductionComplete);
    global.__deployId = g.render?.deployId || null;
    global.__featureRoute = p.generatedFeature?.liveRoute || null;
  } else {
    log('raw:', JSON.stringify(run).slice(0, 1000));
  }
  if (run.exactBlocker) log('exactBlocker:', run.exactBlocker);

  // 4) list features route live
  log('\n=== STEP 4: features list route live ===');
  const fr = await fetch(`${API}/api/ivx/senior-developer/features`);
  const ft = await fr.text();
  log('GET /api/ivx/senior-developer/features HTTP', fr.status);
  log('body:', ft.slice(0, 600));
}

main().catch(e => log('FATAL', String(e)));
