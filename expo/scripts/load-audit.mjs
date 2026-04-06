#!/usr/bin/env node
import { performance } from 'perf_hooks';
import { config as loadEnv } from 'dotenv';

loadEnv();

const LIVE_BASE_URL = (process.env.LOAD_AUDIT_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
const API_BASE_URL = (process.env.LOAD_AUDIT_API_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || LIVE_BASE_URL).trim().replace(/\/$/, '');
const DIRECT_API_BASE_URL = (process.env.LOAD_AUDIT_DIRECT_API_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || API_BASE_URL).trim().replace(/\/$/, '');
const TOTAL_REQUESTS = Number.parseInt(process.env.LOAD_AUDIT_TOTAL_REQUESTS || '30000', 10);
const CONCURRENCY = Number.parseInt(process.env.LOAD_AUDIT_CONCURRENCY || '120', 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.LOAD_AUDIT_TIMEOUT_MS || '8000', 10);
const MAX_DURATION_MS = Number.parseInt(process.env.LOAD_AUDIT_MAX_DURATION_MS || '45000', 10);

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const RUN_WRITE_PROBES = (process.env.LOAD_AUDIT_RUN_WRITE_PROBES || 'true').trim().toLowerCase() === 'true';
const CLEANUP_WRITE_PROBES = (process.env.LOAD_AUDIT_CLEANUP_WRITE_PROBES || 'true').trim().toLowerCase() === 'true';
const AUDIT_EMAIL_DOMAIN = (process.env.LOAD_AUDIT_EMAIL_DOMAIN || 'ivxholding.com').trim().replace(/^@+/, '') || 'ivxholding.com';

const scenarios = [
  { name: 'landing_deals_cdn', weight: 40, url: `${LIVE_BASE_URL}/api/landing-deals` },
  { name: 'published_deals_cdn', weight: 35, url: `${LIVE_BASE_URL}/api/published-jv-deals` },
  { name: 'landing_deals_direct', weight: 25, url: `${DIRECT_API_BASE_URL}/api/landing-deals` },
];

function pickScenario(index) {
  const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
  const marker = index % totalWeight;
  let cursor = 0;
  for (const scenario of scenarios) {
    cursor += scenario.weight;
    if (marker < cursor) return scenario;
  }
  return scenarios[0];
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
  return sorted[position];
}

function isHtml(text) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('<body');
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
    return { ok: false, error: 'Missing Supabase envs for waitlist target resolution' };
  }

  const candidates = [
    { table: 'waitlist_entries', selectColumn: 'email_normalized', mode: 'rich' },
    { table: 'waitlist', selectColumn: 'email', mode: 'legacy' },
  ];

  for (const candidate of candidates) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${candidate.table}?select=id&limit=1`, {
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

function parseDealsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.deals)) return payload.deals;
  return null;
}

function validateDealPayload(deal, index) {
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

async function validateJsonResponse(response, scenarioName) {
  const body = await response.text();
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const bodyPreview = body.slice(0, 200);

  if (!response.ok) {
    return { ok: false, contentType, bytes: body.length, error: `${scenarioName} HTTP ${response.status}`, bodyPreview };
  }

  if (!contentType.includes('application/json')) {
    return { ok: false, contentType, bytes: body.length, error: `${scenarioName} invalid content-type ${contentType || 'unknown'}`, bodyPreview };
  }

  if (isHtml(body)) {
    return { ok: false, contentType, bytes: body.length, error: `${scenarioName} returned HTML instead of JSON`, bodyPreview };
  }

  try {
    const payload = JSON.parse(body);
    const deals = parseDealsPayload(payload);
    if (!Array.isArray(deals)) {
      return { ok: false, contentType, bytes: body.length, error: `${scenarioName} schema mismatch`, bodyPreview };
    }
    if (deals.length === 0) {
      return { ok: false, contentType, bytes: body.length, error: `${scenarioName} empty deals payload`, bodyPreview };
    }
    const dealErrors = deals.flatMap((deal, index) => validateDealPayload(deal, index));
    if (dealErrors.length > 0) {
      return {
        ok: false,
        contentType,
        bytes: body.length,
        error: `${scenarioName} invalid deal payload ${dealErrors.slice(0, 6).join(' | ')}`,
        bodyPreview,
      };
    }
    return { ok: true, contentType, bytes: body.length, error: null, bodyPreview: '', dealCount: deals.length };
  } catch (error) {
    return {
      ok: false,
      contentType,
      bytes: body.length,
      error: `${scenarioName} invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`,
      bodyPreview,
    };
  }
}

async function runRequest(index) {
  const scenario = pickScenario(index);
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(scenario.url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'user-agent': 'IVXLoadAudit/2.0',
        'x-rork-load-audit': 'true',
        'x-rork-load-scenario': scenario.name,
      },
      signal: controller.signal,
    });

    const validation = await validateJsonResponse(response, scenario.name);
    return {
      ok: validation.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      bytes: validation.bytes,
      scenario: scenario.name,
      contentType: validation.contentType,
      dealCount: validation.dealCount ?? 0,
      error: validation.error,
      bodyPreview: validation.bodyPreview,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      bytes: 0,
      scenario: scenario.name,
      contentType: '',
      dealCount: 0,
      error: error instanceof Error ? error.message : String(error),
      bodyPreview: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function deleteAuthUser(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !userId) {
    return { ok: false, skipped: true, error: 'Missing service role or user id for auth cleanup' };
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
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
    return { ok: false, skipped: true, error: 'Missing service role, waitlist target, or email for waitlist cleanup' };
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${selectColumn}=eq.${encodeURIComponent(email)}`, {
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
    return { ok: false, skipped: true, error: 'Missing service role or user id for profile cleanup' };
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
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

async function insertWaitlistProbe() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, name: 'waitlist_submission', error: 'Missing Supabase envs for waitlist write probe' };
  }

  const now = Date.now();
  const email = createAuditEmail('load-audit-waitlist', now);
  const phone = `+1555${String(now).slice(-7)}`;
  const target = await resolveWaitlistTarget();
  if (!target.ok) {
    return { ok: false, name: 'waitlist_submission', error: target.error };
  }

  const richPayload = {
    full_name: 'Load Audit Waitlist',
    first_name: 'Load',
    last_name: 'Audit',
    email,
    phone,
    email_normalized: email,
    phone_e164: phone,
    phone_verified: true,
    accredited_status: 'unsure',
    consent_sms: true,
    consent_email: true,
    source: 'load_audit',
    page_path: '/load-audit',
    referrer: 'load-audit',
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

  const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/${target.table}`, {
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
    return { ok: false, name: 'waitlist_submission', error: `Insert failed: ${insertResponse.status} ${insertBody.slice(0, 160)}` };
  }

  const verifyResponse = await fetch(`${SUPABASE_URL}/rest/v1/${target.table}?${target.selectColumn}=eq.${encodeURIComponent(email)}&select=id,${target.selectColumn}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
  const verifyBody = await verifyResponse.text();
  if (!verifyResponse.ok) {
    return { ok: false, name: 'waitlist_submission', error: `Verify failed: ${verifyResponse.status} ${verifyBody.slice(0, 160)}` };
  }

  let rows;
  try {
    rows = JSON.parse(verifyBody);
  } catch (error) {
    return { ok: false, name: 'waitlist_submission', error: `Verify returned invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }

  return Array.isArray(rows) && rows.length > 0
    ? { ok: true, name: 'waitlist_submission', error: null, email, table: target.table, mode: target.mode, selectColumn: target.selectColumn }
    : { ok: false, name: 'waitlist_submission', error: 'Waitlist row not persisted', email, table: target.table, mode: target.mode, selectColumn: target.selectColumn };
}

async function signupProbe() {
  if (!SUPABASE_URL) {
    return { ok: false, name: 'signup', error: 'Missing Supabase envs for signup probe' };
  }

  const now = Date.now();
  const email = createAuditEmail('load-audit-signup', now);
  const password = `LoadAudit!${now}`;

  if (SUPABASE_SERVICE_ROLE_KEY) {
    const adminResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
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
        user_metadata: {
          firstName: 'Load',
          lastName: 'Audit',
          country: 'US',
          role: 'investor',
        },
      }),
    });

    const adminText = await adminResponse.text();
    if (adminResponse.ok) {
      let adminPayload;
      try {
        adminPayload = JSON.parse(adminText);
      } catch (error) {
        return { ok: false, name: 'signup', error: `Admin signup probe returned invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
      }

      return adminPayload?.user?.id
        ? { ok: true, name: 'signup', error: null, userId: adminPayload.user.id, email, mode: 'admin_create_user' }
        : { ok: false, name: 'signup', error: 'Admin signup probe response missing user.id', email };
    }

    const adminDenied = adminResponse.status === 401 || adminResponse.status === 403 || adminText.includes('not_admin');
    if (!adminDenied) {
      return { ok: false, name: 'signup', error: `Admin signup probe failed: ${adminResponse.status} ${adminText.slice(0, 160)}` };
    }

    console.log('[LoadAudit] Admin signup probe unavailable, falling back to anon signup path');
  }

  if (!SUPABASE_ANON_KEY) {
    return { ok: false, name: 'signup', error: 'Missing Supabase anon key for fallback signup probe' };
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      data: {
        firstName: 'Load',
        lastName: 'Audit',
        country: 'US',
        role: 'investor',
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 429 && text.includes('over_email_send_rate_limit')) {
      return { ok: true, name: 'signup', error: null, skipped: true, note: 'Signup probe skipped because Supabase email send rate limit is temporarily active on anon signup fallback' };
    }
    return { ok: false, name: 'signup', error: `Signup failed: ${response.status} ${text.slice(0, 160)}` };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return { ok: false, name: 'signup', error: `Signup returned invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }

  return payload?.user?.id
    ? { ok: true, name: 'signup', error: null, userId: payload.user.id, email, mode: 'anon_signup' }
    : { ok: false, name: 'signup', error: 'Signup response missing user.id', email };
}

async function profileProbe(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !userId) {
    return { ok: false, name: 'member_creation', error: 'Missing service role or user id for member creation probe' };
  }

  const now = new Date().toISOString();
  const payload = [{
    id: userId,
    email: createAuditEmail(`profile-${userId}`, Date.now()),
    first_name: 'Load',
    last_name: 'Audit',
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

  const upsertResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  const upsertText = await upsertResponse.text();
  if (!upsertResponse.ok) {
    return { ok: false, name: 'member_creation', error: `Profile upsert failed: ${upsertResponse.status} ${upsertText.slice(0, 160)}` };
  }

  const verifyResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
  const verifyText = await verifyResponse.text();
  if (!verifyResponse.ok) {
    return { ok: false, name: 'member_creation', error: `Profile verify failed: ${verifyResponse.status} ${verifyText.slice(0, 160)}` };
  }

  let rows;
  try {
    rows = JSON.parse(verifyText);
  } catch (error) {
    return { ok: false, name: 'member_creation', error: `Profile verify returned invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}` };
  }

  return Array.isArray(rows) && rows.some((row) => row?.id === userId)
    ? { ok: true, name: 'member_creation', error: null, userId }
    : { ok: false, name: 'member_creation', error: 'Profile row not persisted', userId };
}

async function runWriteProbes() {
  if (!RUN_WRITE_PROBES) {
    return { enabled: false, cleanupEnabled: CLEANUP_WRITE_PROBES, results: [], cleanup: [] };
  }

  const signup = await signupProbe();
  const waitlist = await insertWaitlistProbe();
  const memberCreation = signup.ok && 'userId' in signup
    ? await profileProbe(signup.userId)
    : signup.ok
      ? { ok: true, name: 'member_creation', error: null, skipped: true, note: 'Member profile probe skipped because signup did not create a fresh auth user during this audit run' }
      : { ok: false, name: 'member_creation', error: 'Skipped because signup failed' };

  const cleanup = [];
  if (CLEANUP_WRITE_PROBES) {
    if ('email' in waitlist && 'table' in waitlist && 'selectColumn' in waitlist && waitlist.email && waitlist.table && waitlist.selectColumn) {
      cleanup.push({ name: 'waitlist_cleanup', ...(await deleteWaitlistProbe(waitlist.table, waitlist.email, waitlist.selectColumn)) });
    }
    if ('userId' in signup && signup.userId) {
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
  const startedAt = performance.now();
  const results = [];
  let launched = 0;
  let completed = 0;
  let active = 0;
  let stoppedByTimeBudget = false;

  console.log('[LoadAudit] Starting validated API load audit');
  console.log('[LoadAudit] Public base URL:', LIVE_BASE_URL);
  console.log('[LoadAudit] API URL:', API_BASE_URL);
  console.log('[LoadAudit] Direct API URL:', DIRECT_API_BASE_URL);
  console.log('[LoadAudit] Target requests:', TOTAL_REQUESTS);
  console.log('[LoadAudit] Concurrency:', CONCURRENCY);

  await new Promise((resolve) => {
    const launchMore = () => {
      const elapsed = performance.now() - startedAt;
      if (elapsed >= MAX_DURATION_MS) {
        stoppedByTimeBudget = true;
      }

      while (!stoppedByTimeBudget && active < CONCURRENCY && launched < TOTAL_REQUESTS) {
        const currentIndex = launched;
        launched += 1;
        active += 1;
        void runRequest(currentIndex)
          .then((result) => {
            results.push(result);
          })
          .finally(() => {
            completed += 1;
            active -= 1;
            if ((completed % 250) === 0) {
              console.log(`[LoadAudit] Progress ${completed}/${launched} completed, active=${active}`);
            }
            if ((stoppedByTimeBudget || launched >= TOTAL_REQUESTS) && active === 0) {
              resolve();
              return;
            }
            launchMore();
          });
      }

      if ((stoppedByTimeBudget || launched >= TOTAL_REQUESTS) && active === 0) {
        resolve();
      }
    };

    launchMore();
  });

  const writeProbes = await runWriteProbes();
  const totalDurationMs = performance.now() - startedAt;
  const successResults = results.filter((result) => result.ok);
  const failedResults = results.filter((result) => !result.ok);
  const durations = results.map((result) => result.durationMs);
  const invalidPayloadCount = failedResults.filter((result) => typeof result.error === 'string' && (
    result.error.includes('content-type') ||
    result.error.includes('HTML') ||
    result.error.includes('schema') ||
    result.error.includes('empty deals') ||
    result.error.includes('invalid deal payload')
  )).length;
  const scenarioFailures = Object.fromEntries([...failedResults.reduce((map, result) => {
    map.set(result.scenario, (map.get(result.scenario) || 0) + 1);
    return map;
  }, new Map()).entries()]);

  const summary = {
    baseUrl: LIVE_BASE_URL,
    apiBaseUrl: API_BASE_URL,
    directApiBaseUrl: DIRECT_API_BASE_URL,
    requestedVirtualUsers: TOTAL_REQUESTS,
    launchedRequests: launched,
    completedRequests: results.length,
    stoppedByTimeBudget,
    concurrency: CONCURRENCY,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxDurationMs: MAX_DURATION_MS,
    wallTimeMs: Math.round(totalDurationMs),
    requestsPerSecond: results.length > 0 ? Number((results.length / (totalDurationMs / 1000)).toFixed(2)) : 0,
    successRate: results.length > 0 ? Number(((successResults.length / results.length) * 100).toFixed(2)) : 0,
    invalidPayloadCount,
    avgLatencyMs: results.length > 0 ? Number((durations.reduce((sum, value) => sum + value, 0) / results.length).toFixed(2)) : 0,
    p50LatencyMs: percentile(durations, 0.5),
    p95LatencyMs: percentile(durations, 0.95),
    p99LatencyMs: percentile(durations, 0.99),
    scenarioFailures,
    writeProbes,
    topErrors: [...failedResults.reduce((map, result) => {
      const key = result.error || `HTTP_${result.status}`;
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };

  console.log('[LoadAudit] Summary');
  console.log(JSON.stringify(summary, null, 2));

  const writeProbeFailed = Array.isArray(writeProbes.results) && writeProbes.results.some((result) => result && !result.ok);
  if (summary.successRate < 95 || invalidPayloadCount > 0 || writeProbeFailed) {
    process.exitCode = 2;
  }
}

void main();
