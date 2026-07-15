#!/usr/bin/env node

/**
 * IVX Holdings — Self-Hosted Supabase Health Check
 * Verifies all Supabase services are running and responsive.
 *
 * Usage:
 *   node deploy/supabase/health-check.mjs
 *
 * Env vars:
 *   SUPABASE_URL    — Kong gateway URL (e.g. http://localhost:8000)
 *   ANON_KEY        — Supabase anon key
 *   SERVICE_ROLE_KEY — Supabase service_role key
 *   POSTGRES_HOST   — DB host (default: localhost)
 *   POSTGRES_PORT   — DB port (default: 5432)
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const ANON_KEY = process.env.ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || '';
const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = process.env.POSTGRES_PORT || '5432';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

function ok(msg) { console.log(`  ${GREEN}✓${NC} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${NC} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${NC} ${msg}`); }


async function checkEndpoint(name, url, headers = {}, expectStatus = 200) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    const ms = Date.now() - start;

    if (res.status === expectStatus || (res.status >= 200 && res.status < 400)) {
      ok(`${name} — ${res.status} (${ms}ms)`);
      return { ok: true, status: res.status, ms };
    } else {
      fail(`${name} — ${res.status} (${ms}ms)`);
      return { ok: false, status: res.status, ms };
    }
  } catch (err) {
    const ms = Date.now() - start;
    fail(`${name} — ${err.message} (${ms}ms)`);
    return { ok: false, status: 0, ms, error: err.message };
  }
}

async function checkAuth() {
  return checkEndpoint(
    'Auth (GoTrue)',
    `${SUPABASE_URL}/auth/v1/health`,
    { apikey: ANON_KEY }
  );
}

async function checkRest() {
  return checkEndpoint(
    'REST (PostgREST)',
    `${SUPABASE_URL}/rest/v1/`,
    { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  );
}

async function checkRestQuery() {
  const result = await checkEndpoint(
    'REST Query (profiles)',
    `${SUPABASE_URL}/rest/v1/profiles?select=count&limit=1`,
    { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Prefer: 'count=exact' }
  );
  return result;
}

async function checkRealtime() {
  return checkEndpoint(
    'Realtime (WebSocket info)',
    `${SUPABASE_URL}/realtime/v1/`,
    { apikey: ANON_KEY }
  );
}

async function checkStorage() {
  return checkEndpoint(
    'Storage',
    `${SUPABASE_URL}/storage/v1/`,
    { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  );
}

async function checkMeta() {
  return checkEndpoint(
    'Meta (pg-meta)',
    `${SUPABASE_URL}/pg/`,
    { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
  );
}

async function checkStudio() {
  const studioPort = process.env.STUDIO_PORT || '3100';
  const studioUrl = `http://${PG_HOST}:${studioPort}`;
  return checkEndpoint('Studio (Admin UI)', studioUrl);
}

async function checkPostgres() {
  const start = Date.now();
  try {
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = new net.default.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        const ms = Date.now() - start;
        fail(`Postgres TCP — timeout (${ms}ms)`);
        resolve({ ok: false, ms });
      }, 5000);

      socket.connect(parseInt(PG_PORT), PG_HOST, () => {
        clearTimeout(timeout);
        socket.destroy();
        const ms = Date.now() - start;
        ok(`Postgres TCP — port ${PG_PORT} open (${ms}ms)`);
        resolve({ ok: true, ms });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        const ms = Date.now() - start;
        fail(`Postgres TCP — ${err.message} (${ms}ms)`);
        resolve({ ok: false, ms, error: err.message });
      });
    });
  } catch (err) {
    const ms = Date.now() - start;
    fail(`Postgres TCP — ${err.message} (${ms}ms)`);
    return { ok: false, ms };
  }
}

async function checkTableCount() {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const tables = [
      'profiles', 'wallets', 'jv_deals', 'landing_deals', 'properties',
      'transactions', 'notifications', 'waitlist', 'audit_trail',
    ];

    let found = 0;
    let missing = 0;

    for (const table of tables) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`,
        {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          signal: controller.signal,
        }
      );
      if (res.ok) {
        found++;
      } else {
        missing++;
      }
    }
    clearTimeout(timeout);

    const ms = Date.now() - start;
    if (missing === 0) {
      ok(`Core tables — ${found}/${tables.length} found (${ms}ms)`);
    } else {
      warn(`Core tables — ${found}/${tables.length} found, ${missing} missing (${ms}ms)`);
    }
    return { ok: missing === 0, found, missing, ms };
  } catch (err) {
    const ms = Date.now() - start;
    fail(`Core tables — ${err.message} (${ms}ms)`);
    return { ok: false, ms };
  }
}

async function main() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  IVX Holdings — Self-Hosted Supabase Health Check');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (!ANON_KEY) {
    warn('ANON_KEY not set — some checks will fail');
  }
  if (!SERVICE_ROLE_KEY) {
    warn('SERVICE_ROLE_KEY not set — admin checks will fail');
  }

  console.log(`${BLUE}Infrastructure:${NC}`);
  const pgResult = await checkPostgres();

  console.log('');
  console.log(`${BLUE}Supabase Services:${NC}`);
  const results = await Promise.all([
    checkAuth(),
    checkRest(),
    checkRealtime(),
    checkStorage(),
  ]);

  if (SERVICE_ROLE_KEY) {
    results.push(await checkMeta());
  }

  console.log('');
  console.log(`${BLUE}Data Verification:${NC}`);
  const restQuery = await checkRestQuery();
  const tableCheck = SERVICE_ROLE_KEY ? await checkTableCount() : null;

  console.log('');
  console.log(`${BLUE}Optional Services:${NC}`);
  await checkStudio();

  const allResults = [pgResult, ...results, restQuery, tableCheck].filter(Boolean);
  const passed = allResults.filter(r => r && r.ok).length;
  const failed = allResults.filter(r => r && !r.ok).length;
  const avgMs = Math.round(allResults.reduce((sum, r) => sum + (r?.ms || 0), 0) / allResults.length);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (failed === 0) {
    console.log(`  ${GREEN}ALL CHECKS PASSED${NC} — ${passed} services healthy (avg ${avgMs}ms)`);
  } else {
    console.log(`  ${RED}${failed} FAILED${NC}, ${GREEN}${passed} passed${NC} (avg ${avgMs}ms)`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Health check failed:', err);
  process.exit(1);
});
