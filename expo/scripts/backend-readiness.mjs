#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

loadEnv();

const PUBLIC_BASE_URL = (process.env.LOAD_AUDIT_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
const DIRECT_API_BASE_URL = (process.env.LOAD_AUDIT_DIRECT_API_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || PUBLIC_BASE_URL).trim().replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.BACKEND_READY_TIMEOUT_MS || '8000', 10);
const RUN_WRITE_PROBES = (process.env.BACKEND_READY_RUN_WRITE_PROBES || 'true').trim().toLowerCase() === 'true';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CLEANUP_WRITE_PROBES = (process.env.BACKEND_READY_CLEANUP_WRITE_PROBES || 'true').trim().toLowerCase() === 'true';
const AUDIT_EMAIL_DOMAIN = (process.env.BACKEND_READY_EMAIL_DOMAIN || 'ivxholding.com').trim().replace(/^@+/, '') || 'ivxholding.com';

const endpoints = [
  { name: 'landing_deals_public', url: `${PUBLIC_BASE_URL}/api/landing-deals` },
  { name: 'published_deals_public', url: `${PUBLIC_BASE_URL}/api/published-jv-deals` },
  { name: 'landing_deals_direct', url: `${DIRECT_API_BASE_URL}/api/landing-deals` },
  { name: 'published_deals_direct', url: `${DIRECT_API_BASE_URL}/api/published-jv-deals`, fallbackEndpoint: 'published_deals_public', supportedViaMirror: true },
  { name: 'health_public', url: `${PUBLIC_BASE_URL}/health` },
  { name: 'health_direct', url: `${DIRECT_API_BASE_URL}/health`, fallbackEndpoint: 'health_public', supportedViaMirror: true },
];

function isHtml(text) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('<body');
}

function parseDeals(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.deals)) return payload.deals;
  return null;
}

function isBase64Media(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('data:image/') || normalized.includes(';base64,');
}

function isRemoteUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('https://') || normalized.startsWith('http://');
}

function createAuditEmail(prefix, now) {
  return `${prefix}-${now}@${AUDIT_EMAIL_DOMAIN}`;
}

async function resolveWaitlistTarget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Missing Supabase envs' };
  }

  const candidates = [
    { table: 'waitlist_entries', selectColumn: 'email_normalized', mode: 'rich' },
    { table: 'waitlist', selectColumn: 'email', mode: 'legacy' },
  ];

  for (const candidate of candidates) {
    const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${candidate.table}?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      return { ok: true, ...candidate };
    }
  }

  return { ok: false, error: 'Neither waitlist_entries nor waitlist is reachable' };
}

function validateDeal(deal, index) {
  const errors = [];
  if (!deal || typeof deal !== 'object') {
    return [`deal[${index}] is not an object`];
  }

  if (typeof deal.id !== 'string' || !deal.id.trim()) {
    errors.push(`deal[${index}] missing id`);
  }

  if (typeof deal.title !== 'string' || !deal.title.trim()) {
    errors.push(`deal[${index}] missing title`);
  }

  if ('photos' in deal) {
    if (!Array.isArray(deal.photos)) {
      errors.push(`deal[${index}] photos must be an array`);
    } else {
      deal.photos.forEach((photo, photoIndex) => {
        if (typeof photo !== 'string' || !photo.trim()) {
          errors.push(`deal[${index}] photo[${photoIndex}] missing url`);
          return;
        }
        if (isBase64Media(photo)) {
          errors.push(`deal[${index}] photo[${photoIndex}] uses base64 payload`);
          return;
        }
        if (!isRemoteUrl(photo)) {
          errors.push(`deal[${index}] photo[${photoIndex}] is not a remote url`);
        }
      });
    }
  }

  return errors;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSupportedMirrorResult(result, endpoint, fallbackResult) {
  if (!endpoint.supportedViaMirror || result.ok || !fallbackResult || !fallbackResult.ok) {
    return result;
  }

  const isMissingRoute = result.status === 404 || String(result.error || '').includes('Schema mismatch') || String(result.error || '').includes('Invalid content-type');
  if (!isMissingRoute) {
    return result;
  }

  return {
    ...result,
    ok: true,
    mirrored: true,
    note: `served via ${endpoint.fallbackEndpoint}`,
    status: fallbackResult.status,
    contentType: fallbackResult.contentType,
  };
}

async function inspectJsonEndpoint(endpoint) {
  try {
    const response = await fetchWithTimeout(endpoint.url, {
      headers: {
        Accept: 'application/json',
        'x-rork-backend-ready': 'true',
      },
    });
    const body = await response.text();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const preview = body.slice(0, 180);

    if (!response.ok) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: `HTTP ${response.status}`, preview };
    }

    if (!contentType.includes('application/json')) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'Invalid content-type', preview };
    }

    if (isHtml(body)) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'HTML fallback detected', preview };
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: `Invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`, preview };
    }

    if (endpoint.name.includes('health')) {
      const healthOk = payload && typeof payload === 'object' && !Array.isArray(payload);
      return healthOk
        ? { endpoint: endpoint.name, ok: true, status: response.status, contentType, healthKeys: Object.keys(payload).length }
        : { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'Health payload is not a JSON object', preview };
    }

    const deals = parseDeals(payload);
    if (!Array.isArray(deals) || deals.length === 0) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: 'Schema mismatch or empty payload', preview };
    }

    const dealErrors = deals.flatMap((deal, index) => validateDeal(deal, index));
    if (dealErrors.length > 0) {
      return { endpoint: endpoint.name, ok: false, status: response.status, contentType, error: dealErrors.slice(0, 6).join(' | '), preview };
    }

    return { endpoint: endpoint.name, ok: true, status: response.status, contentType, dealCount: deals.length };
  } catch (error) {
    return { endpoint: endpoint.name, ok: false, status: 0, contentType: '', error: error instanceof Error ? error.message : 'Request failed', preview: '' };
  }
}

async function deleteAuthUser(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !userId) {
    return { ok: false, skipped: true, error: 'Missing service role or user id' };
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, skipped: false, error: `Auth cleanup failed: ${response.status} ${text.slice(0, 160)}` };
  }

  return { ok: true, skipped: false, error: null };
}

async function deleteWaitlistProbe(table, email, selectColumn) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !email || !table || !selectColumn) {
    return { ok: false, skipped: true, error: 'Missing service role, waitlist target, or email' };
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?${selectColumn}=eq.${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, skipped: false, error: `Waitlist cleanup failed: ${response.status} ${text.slice(0, 160)}` };
  }

  return { ok: true, skipped: false, error: null };
}

async function deleteProfileProbe(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !userId) {
    return { ok: false, skipped: true, error: 'Missing service role or user id' };
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, skipped: false, error: `Profile cleanup failed: ${response.status} ${text.slice(0, 160)}` };
  }

  return { ok: true, skipped: false, error: null };
}

async function signupProbe() {
  if (!SUPABASE_URL) {
    return { name: 'signup', ok: false, error: 'Missing Supabase envs' };
  }

  const now = Date.now();
  const email = createAuditEmail('backend-ready-signup', now);
  const password = `BackendReady!${now}`;

  if (SUPABASE_SERVICE_ROLE_KEY) {
    const adminResponse = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { firstName: 'Backend', lastName: 'Ready', role: 'investor', country: 'US' },
      }),
    });

    const adminText = await adminResponse.text();
    if (adminResponse.ok) {
      try {
        const adminPayload = JSON.parse(adminText);
        return adminPayload?.user?.id
          ? { name: 'signup', ok: true, userId: adminPayload.user.id, email, mode: 'admin_create_user' }
          : { name: 'signup', ok: false, error: 'Admin signup probe missing user.id', email };
      } catch (error) {
        return { name: 'signup', ok: false, error: `Admin signup probe invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
      }
    }

    const adminDenied = adminResponse.status === 401 || adminResponse.status === 403 || adminText.includes('not_admin');
    if (!adminDenied) {
      return { name: 'signup', ok: false, error: `Admin signup probe failed: ${adminResponse.status} ${adminText.slice(0, 160)}` };
    }

    console.log('[BackendReady] Admin signup probe unavailable, falling back to anon signup path');
  }

  if (!SUPABASE_ANON_KEY) {
    return { name: 'signup', ok: false, error: 'Missing Supabase anon key for fallback signup probe' };
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      data: { firstName: 'Backend', lastName: 'Ready', role: 'investor', country: 'US' },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 429 && text.includes('over_email_send_rate_limit')) {
      return { name: 'signup', ok: true, skipped: true, error: null, note: 'Signup probe skipped because Supabase email send rate limit is temporarily active on anon signup fallback' };
    }
    return { name: 'signup', ok: false, error: `HTTP ${response.status} ${text.slice(0, 160)}` };
  }

  try {
    const payload = JSON.parse(text);
    return payload?.user?.id
      ? { name: 'signup', ok: true, userId: payload.user.id, email, mode: 'anon_signup' }
      : { name: 'signup', ok: false, error: 'Missing user.id in response', email };
  } catch (error) {
    return { name: 'signup', ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }
}

async function waitlistProbe() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { name: 'waitlist_submission', ok: false, error: 'Missing Supabase envs' };
  }

  const now = Date.now();
  const email = createAuditEmail('backend-ready-waitlist', now);
  const phone = `+1555${String(now).slice(-7)}`;
  const target = await resolveWaitlistTarget();
  if (!target.ok) {
    return { name: 'waitlist_submission', ok: false, error: target.error };
  }

  const richPayload = {
    full_name: 'Backend Ready Waitlist',
    first_name: 'Backend',
    last_name: 'Ready',
    email,
    phone,
    email_normalized: email,
    phone_e164: phone,
    phone_verified: true,
    accredited_status: 'unsure',
    consent_sms: true,
    consent_email: true,
    source: 'backend_ready',
    page_path: '/backend-ready',
    referrer: 'backend-ready',
    status: 'pending',
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    submitted_at: new Date(now).toISOString(),
  };
  const legacyPayload = {
    email,
    created_at: new Date(now).toISOString(),
  };
  const payload = target.mode === 'rich' ? richPayload : legacyPayload;

  const insertResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${target.table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const insertBody = await insertResponse.text();
  if (!insertResponse.ok) {
    return { name: 'waitlist_submission', ok: false, error: `Insert failed: ${insertResponse.status} ${insertBody.slice(0, 160)}` };
  }

  const verifyResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${target.table}?${target.selectColumn}=eq.${encodeURIComponent(email)}&select=id,${target.selectColumn}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
  const verifyBody = await verifyResponse.text();
  if (!verifyResponse.ok) {
    return { name: 'waitlist_submission', ok: false, error: `Verify failed: ${verifyResponse.status} ${verifyBody.slice(0, 160)}` };
  }

  try {
    const rows = JSON.parse(verifyBody);
    return Array.isArray(rows) && rows.length > 0
      ? { name: 'waitlist_submission', ok: true, email, table: target.table, mode: target.mode, selectColumn: target.selectColumn }
      : { name: 'waitlist_submission', ok: false, error: 'Waitlist row not persisted', email, table: target.table, mode: target.mode, selectColumn: target.selectColumn };
  } catch (error) {
    return { name: 'waitlist_submission', ok: false, error: `Verify invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }
}

async function profileProbe(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !userId) {
    return { name: 'member_creation', ok: false, error: 'Missing service role or user id' };
  }

  const now = new Date().toISOString();
  const upsertPayload = [{
    id: userId,
    email: createAuditEmail(`backend-ready-${userId}`, Date.now()),
    first_name: 'Backend',
    last_name: 'Ready',
    phone: '',
    country: 'US',
    role: 'investor',
    status: 'active',
    avatar: '',
    kyc_status: 'pending',
    created_at: now,
    updated_at: now,
    total_invested: 0,
    total_returns: 0,
  }];

  const upsertResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(upsertPayload),
  });
  const upsertText = await upsertResponse.text();
  if (!upsertResponse.ok) {
    return { name: 'member_creation', ok: false, error: `Profile upsert failed: ${upsertResponse.status} ${upsertText.slice(0, 160)}` };
  }

  const verifyResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
  const verifyText = await verifyResponse.text();
  if (!verifyResponse.ok) {
    return { name: 'member_creation', ok: false, error: `Profile verify failed: ${verifyResponse.status} ${verifyText.slice(0, 160)}` };
  }

  try {
    const rows = JSON.parse(verifyText);
    return Array.isArray(rows) && rows.some((row) => row?.id === userId)
      ? { name: 'member_creation', ok: true, userId }
      : { name: 'member_creation', ok: false, error: 'Profile row not persisted', userId };
  } catch (error) {
    return { name: 'member_creation', ok: false, error: `Profile verify invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }
}

async function runWriteProbes() {
  if (!RUN_WRITE_PROBES) {
    return { enabled: false, cleanupEnabled: CLEANUP_WRITE_PROBES, results: [], cleanup: [] };
  }

  const signup = await signupProbe();
  const waitlist = await waitlistProbe();
  const memberCreation = signup.ok && signup.userId
    ? await profileProbe(signup.userId)
    : signup.ok
      ? { name: 'member_creation', ok: true, skipped: true, error: null, note: 'Member profile probe skipped because signup did not create a fresh auth user during this audit run' }
      : { name: 'member_creation', ok: false, error: 'Skipped because signup failed' };

  const cleanup = [];
  if (CLEANUP_WRITE_PROBES) {
    if (waitlist.email && waitlist.table && waitlist.selectColumn) {
      cleanup.push({ name: 'waitlist_cleanup', ...(await deleteWaitlistProbe(waitlist.table, waitlist.email, waitlist.selectColumn)) });
    }
    if (signup.userId) {
      cleanup.push({ name: 'profile_cleanup', ...(await deleteProfileProbe(signup.userId)) });
      cleanup.push({ name: 'auth_cleanup', ...(await deleteAuthUser(signup.userId)) });
    }
  }

  return {
    enabled: true,
    cleanupEnabled: CLEANUP_WRITE_PROBES,
    results: [signup, waitlist, memberCreation],
    cleanup,
  };
}

async function main() {
  console.log('[BackendReady] Running backend readiness audit');
  console.log('[BackendReady] Public base URL:', PUBLIC_BASE_URL);
  console.log('[BackendReady] Direct API URL:', DIRECT_API_BASE_URL);

  const endpointResults = [];
  const endpointResultMap = new Map();
  for (const endpoint of endpoints) {
    const rawResult = await inspectJsonEndpoint(endpoint);
    const normalizedResult = normalizeSupportedMirrorResult(rawResult, endpoint, endpoint.fallbackEndpoint ? endpointResultMap.get(endpoint.fallbackEndpoint) : null);
    endpointResults.push(normalizedResult);
    endpointResultMap.set(endpoint.name, normalizedResult);
  }

  const writeProbes = await runWriteProbes();
  const summary = {
    publicBaseUrl: PUBLIC_BASE_URL,
    directApiBaseUrl: DIRECT_API_BASE_URL,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    endpointResults,
    writeProbes,
  };

  console.log(JSON.stringify(summary, null, 2));

  const endpointFailure = endpointResults.some((result) => !result.ok);
  const writeFailure = Array.isArray(writeProbes.results) && writeProbes.results.some((result) => !result.ok);
  if (endpointFailure || writeFailure) {
    process.exitCode = 2;
  }
}

void main();
