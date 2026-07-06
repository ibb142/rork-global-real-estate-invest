/**
 * Live end-to-end audit: IVX Senior Developer Brain.
 *
 * Verifies that the owner AI now answers senior-developer / audit / fix requests
 * directly instead of returning the old BLOCKED proof-ledger bureaucracy.
 */
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const ENV_PATH = new URL('../../expo/.env', import.meta.url);
function loadEnv() {
  const text = readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^['"]/, '').replace(/['"]$/, '');
  }
  return env;
}

const env = loadEnv();
const API_BASE = 'https://api.ivxholding.com';
const OWNER_EMAIL = env.IVX_OWNER_EMAIL;
const OWNER_PASSWORD = env.IVX_OWNER_PASSWORD;
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function supabaseSignIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Supabase sign-in failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function ownerAi(token, message) {
  const res = await fetch(`${API_BASE}/api/ivx/owner-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      requestId: `audit-senior-brain-${Date.now()}`,
      conversationId: 'ivx-owner-ai-senior-dev-brain-audit',
      persistUserMessage: false,
      persistAssistantMessage: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function health() {
  const res = await fetch(`${API_BASE}/health`, { method: 'GET' });
  return { status: res.status, text: await res.text().catch(() => '') };
}

async function seniorDevStatus() {
  const res = await fetch(`${API_BASE}/api/ivx/senior-developer/status`, { method: 'GET' });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function credentialAudit() {
  const res = await fetch(`${API_BASE}/api/ivx/senior-developer/credential-audit`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${await supabaseSignIn()}` },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const prompts = [
  'Rork i want you to audit and fix senior developer i want my senior developer to have same brain like you answer exactly what I ask',
  'Act as senior developer',
  'Do you in a senior developer mode?',
  'Audit and fix the senior developer brain now',
  'Senior developer is not working as senior developer',
];

const startedAt = new Date().toISOString();
const results = [];

const healthCheck = await health();
const statusCheck = await seniorDevStatus();

let token;
try {
  token = await supabaseSignIn();
} catch (err) {
  console.error('Supabase sign-in failed:', err.message);
}

for (const prompt of prompts) {
  const result = token ? await ownerAi(token, prompt) : { status: 0, error: 'no token' };
  const answer = result.data?.answer ?? '';
  const blocked = answer.includes('STATE: BLOCKED') || answer.includes('UNVERIFIED') || answer.includes('REQUIRED ACTION');
  const ready = answer.includes('STATUS: READY') || answer.includes('I am IVX Senior Developer') || answer.includes('YES');
  results.push({
    prompt,
    status: result.status,
    blocked,
    ready,
    source: result.data?.source ?? null,
    answerPreview: answer.slice(0, 200).replace(/\n/g, ' '),
  });
}

const credAudit = token ? await credentialAudit() : { status: 0, error: 'no token' };

const allReady = results.every((r) => r.ready && !r.blocked);
const verdict = allReady ? 'SENIOR_DEVELOPER_BRAIN_LIVE_AND_DIRECT' : 'SENIOR_DEVELOPER_BRAIN_STILL_BLOCKED';

const proof = {
  auditId: `senior-dev-brain-live-${Date.now()}`,
  timestamp: startedAt,
  verdict,
  apiBase: API_BASE,
  health: healthCheck,
  seniorDevStatus: statusCheck,
  credentialAudit: credAudit,
  promptResults: results,
  allReady,
  blockedCount: results.filter((r) => r.blocked).length,
  readyCount: results.filter((r) => r.ready).length,
};

const proofPath = `backend/verification-proof/senior-developer-brain-live-${Date.now()}.json`;
await writeFile(proofPath, JSON.stringify(proof, null, 2));

console.log(JSON.stringify(proof, null, 2));
console.log(`\nProof written: ${proofPath}`);
process.exit(allReady ? 0 : 1);
