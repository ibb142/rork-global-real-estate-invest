// Live end-to-end audit for IVX Senior Developer workflow.
// Run: node expo/scripts/audit-senior-developer-live.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ENV_PATH = new URL('../.env', import.meta.url).pathname;
const rawEnv = readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of rawEnv.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = (env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY || '';
const OWNER_EMAIL = (env.IVX_OWNER_EMAIL || '').toLowerCase();
const OWNER_PASSWORD = env.IVX_OWNER_PASSWORD || '';
const BACKEND_URL = 'https://ivx-holdings-platform.onrender.com';
const API_URL = 'https://api.ivxholding.com';

const auditId = `senior-developer-live-${Date.now()}`;
const ts = () => new Date().toISOString();
const step = (name, data) => console.log(`[${ts()}] ${name}:`, data);

console.log('=== IVX SENIOR DEVELOPER LIVE E2E AUDIT ===');
console.log(`auditId=${auditId}`);
console.log(`backend=${BACKEND_URL}`);
console.log(`owner=${OWNER_EMAIL}`);

// 1. Supabase password grant -> owner session
async function passwordGrant() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  if (!r.ok) return { ok: false, status: r.status, error: (j.error_description || j.msg || j.error || text).slice(0, 200) };
  return { ok: true, accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_at };
}

// 2. Backend health
async function backendHealth() {
  const r = await fetch(`${API_URL}/health`);
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, status2: j.status, commit: j.commit, routes: j.routes, bootTime: j.bootTime };
}

// 3. Senior developer status (owner-gated)
async function seniorDevStatus(token) {
  const r = await fetch(`${BACKEND_URL}/api/ivx/senior-developer/status`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, payload: j, bodyPreview: text.slice(0, 200) };
}

// 4. Senior developer credential audit (owner-gated)
async function seniorDevCredentialAudit(token) {
  const r = await fetch(`${BACKEND_URL}/api/ivx/senior-developer/credential-audit`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, payload: j, bodyPreview: text.slice(0, 200) };
}

// 5. Owner AI with senior-developer question (should NOT be blocked after fix)
async function ownerAIChat(token, message) {
  const r = await fetch(`${BACKEND_URL}/api/ivx/owner-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, answer: j.answer || null, source: j.source || null, status2: j.status, bodyPreview: text.slice(0, 300) };
}

// 6. Senior developer worker status (owner-gated)
async function workerStatus(token) {
  const r = await fetch(`${BACKEND_URL}/api/ivx/senior-developer/worker/status`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, payload: j, bodyPreview: text.slice(0, 200) };
}

const results = {};
try { results.passwordGrant = await passwordGrant(); step('passwordGrant', { ok: results.passwordGrant.ok, status: results.passwordGrant.status, hasToken: !!results.passwordGrant.accessToken }); } catch (e) { results.passwordGrant = { ok: false, error: String(e) }; }
const token = results.passwordGrant?.accessToken || null;

try { results.backendHealth = await backendHealth(); step('backendHealth', results.backendHealth); } catch (e) { results.backendHealth = { ok: false, error: String(e) }; }
if (token) {
  try { results.seniorDevStatus = await seniorDevStatus(token); step('seniorDevStatus', { ok: results.seniorDevStatus.ok, status: results.seniorDevStatus.status }); } catch (e) { results.seniorDevStatus = { ok: false, error: String(e) }; }
  try { results.seniorDevCredentialAudit = await seniorDevCredentialAudit(token); step('seniorDevCredentialAudit', { ok: results.seniorDevCredentialAudit.ok, status: results.seniorDevCredentialAudit.status }); } catch (e) { results.seniorDevCredentialAudit = { ok: false, error: String(e) }; }
  try { results.ownerAIChatSeniorDevQuestion = await ownerAIChat(token, 'Do you in a senior developer mode?'); step('ownerAIChatSeniorDevQuestion', results.ownerAIChatSeniorDevQuestion); } catch (e) { results.ownerAIChatSeniorDevQuestion = { ok: false, error: String(e) }; }
  try { results.workerStatus = await workerStatus(token); step('workerStatus', { ok: results.workerStatus.ok, status: results.workerStatus.status }); } catch (e) { results.workerStatus = { ok: false, error: String(e) }; }
} else {
  results.seniorDevStatus = { skipped: 'no owner token' };
  results.seniorDevCredentialAudit = { skipped: 'no owner token' };
  results.ownerAIChatSeniorDevQuestion = { skipped: 'no owner token' };
  results.workerStatus = { skipped: 'no owner token' };
}

const backendLive = results.backendHealth?.ok && results.backendHealth.status2 === 'healthy';
const sessionIssued = results.passwordGrant?.ok && !!results.passwordGrant.accessToken;
const seniorDevStatusOk = results.seniorDevStatus?.ok;
const seniorDevCredentialsOk = results.seniorDevCredentialAudit?.ok && results.seniorDevCredentialAudit?.payload?.ok;
const ownerAIBlocked = results.ownerAIChatSeniorDevQuestion?.ok && results.ownerAIChatSeniorDevQuestion?.answer?.includes('BLOCKED');
const workerReachable = results.workerStatus?.ok;

const verdict = (backendLive && sessionIssued && seniorDevStatusOk && (seniorDevCredentialsOk || workerReachable) && !ownerAIBlocked)
  ? 'SENIOR_DEVELOPER_MODE_LIVE'
  : 'SENIOR_DEVELOPER_BLOCKED_OR_MISSING';

const proof = {
  auditId,
  timestamp: ts(),
  verdict,
  backendUrl: BACKEND_URL,
  apiUrl: API_URL,
  supabaseUrl: SUPABASE_URL,
  ownerEmail: OWNER_EMAIL,
  booleans: { backendLive, sessionIssued, seniorDevStatusOk, seniorDevCredentialsOk, ownerAIBlocked, workerReachable },
  checks: {
    passwordGrant: { ok: results.passwordGrant?.ok, status: results.passwordGrant?.status, hasToken: !!results.passwordGrant?.accessToken, error: results.passwordGrant?.error },
    backendHealth: results.backendHealth,
    seniorDevStatus: results.seniorDevStatus,
    seniorDevCredentialAudit: results.seniorDevCredentialAudit,
    ownerAIChatSeniorDevQuestion: results.ownerAIChatSeniorDevQuestion,
    workerStatus: results.workerStatus,
  },
  secretValuesReturned: false,
};

mkdirSync('backend/verification-proof', { recursive: true });
const outPath = `backend/verification-proof/${auditId}.json`;
writeFileSync(outPath, JSON.stringify(proof, null, 2));
console.log('\n=== VERDICT ===');
console.log(verdict);
console.log(`proof written: ${outPath}`);
