/**
 * Reset the IVX owner password in Supabase to match IVX_OWNER_PASSWORD.
 *
 * Uses the service role key to update the auth.users password via the GoTrue
 * admin API. After reset, performs a password sign-in to verify the change.
 */
import { readFileSync } from 'node:fs';

function loadEnv() {
  const path = new URL('../../expo/.env', import.meta.url);
  const text = readFileSync(path, 'utf8');
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
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://kvclcdjmjghndxsngfzb.supabase.co';
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const OWNER_EMAIL = (env.IVX_OWNER_EMAIL ?? '').trim().toLowerCase();
const OWNER_PASSWORD = env.IVX_OWNER_PASSWORD ?? '';

async function findOwnerUser() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  const users = Array.isArray(body.users) ? body.users : [];
  return users.find((u) => (u.email ?? '').toLowerCase() === OWNER_EMAIL);
}

async function resetPassword(userId) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ password: OWNER_PASSWORD }),
  });
  const text = await response.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    httpStatus: response.status,
    body,
  };
}

async function testSignIn() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  const text = await response.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    httpStatus: response.status,
    body,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const owner = await findOwnerUser();

  if (!owner) {
    console.log(JSON.stringify({
      success: false,
      error: `Owner user ${OWNER_EMAIL} not found in Supabase auth.`,
      auditedAt: startedAt,
    }, null, 2));
    process.exit(1);
  }

  const reset = await resetPassword(owner.id);
  if (reset.httpStatus !== 200) {
    console.log(JSON.stringify({
      success: false,
      step: 'reset_password',
      error: reset.body,
      auditedAt: startedAt,
    }, null, 2));
    process.exit(1);
  }

  const signIn = await testSignIn();
  if (signIn.httpStatus !== 200 || !signIn.body?.access_token) {
    console.log(JSON.stringify({
      success: false,
      step: 'test_sign_in',
      error: signIn.body,
      auditedAt: startedAt,
    }, null, 2));
    process.exit(1);
  }

  const evidence = {
    success: true,
    auditedAt: startedAt,
    ownerEmail: OWNER_EMAIL,
    ownerUserId: owner.id,
    passwordResetHttpStatus: reset.httpStatus,
    signInHttpStatus: signIn.httpStatus,
    tokenLength: signIn.body.access_token.length,
    tokenIssuer: typeof signIn.body.access_token === 'string'
      ? JSON.parse(Buffer.from(signIn.body.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signIn.body.access_token.split('.')[1].length / 4) * 4, '='), 'base64').toString()).iss
      : null,
  };

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
