#!/usr/bin/env node

/**
 * IVX Holdings — Supabase Production Validation
 * Validates schema, RLS, auth, realtime, storage, and chat tables.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node validate-supabase.mjs
 *   or: node validate-supabase.mjs (reads from env)
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

const pass = (msg) => console.log(`  ${GREEN}[PASS]${NC} ${msg}`);
const fail = (msg) => console.log(`  ${RED}[FAIL]${NC} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}[WARN]${NC} ${msg}`);
const info = (msg) => console.log(`  ${BLUE}[INFO]${NC} ${msg}`);
const step = (msg) => console.log(`\n${BOLD}${CYAN}━━━ ${msg} ━━━${NC}`);

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function record(status) {
  if (status === 'pass') passCount++;
  else if (status === 'fail') failCount++;
  else if (status === 'warn') warnCount++;
}

async function supabaseRequest(path, options = {}) {
  const key = options.useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { status: res.status, data: await res.json().catch(() => null), ok: res.ok };
  } catch (err) {
    clearTimeout(timeout);
    return { status: 0, data: null, ok: false, error: err.message };
  }
}

async function checkConnection() {
  step('1. Connection & Auth');

  if (!SUPABASE_URL) {
    fail('SUPABASE_URL not set'); record('fail');
    return false;
  }
  pass(`URL configured: ${SUPABASE_URL}`); record('pass');

  if (!SUPABASE_ANON_KEY) {
    fail('SUPABASE_ANON_KEY not set'); record('fail');
    return false;
  }
  pass('Anon key configured'); record('pass');

  if (!SUPABASE_SERVICE_KEY) {
    warn('Service role key not set — admin checks will be skipped'); record('warn');
  } else if (SUPABASE_SERVICE_KEY === SUPABASE_ANON_KEY) {
    fail('Service role key matches anon key — this is NOT a valid service key'); record('fail');
  } else {
    pass('Service role key configured (distinct from anon)'); record('pass');
  }

  const healthRes = await supabaseRequest('/rest/v1/', { headers: { 'Prefer': 'count=exact' } });
  if (healthRes.ok || healthRes.status === 200) {
    pass(`REST API reachable (${healthRes.status})`); record('pass');
  } else if (healthRes.status === 401) {
    info(`REST root requires service_role (${healthRes.status}) — probing via table access`);
    const probeRes = await supabaseRequest('/rest/v1/profiles?select=count&limit=0', {
      headers: { 'Prefer': 'count=exact' },
    });
    if (probeRes.ok || probeRes.status === 200 || probeRes.status === 206) {
      pass(`REST API reachable via table probe (${probeRes.status})`); record('pass');
    } else {
      fail(`REST API unreachable even via table probe: ${probeRes.status} ${probeRes.error || ''}`); record('fail');
      return false;
    }
  } else {
    fail(`REST API unreachable: ${healthRes.status} ${healthRes.error || ''}`); record('fail');
    return false;
  }

  const authRes = await supabaseRequest('/auth/v1/settings');
  if (authRes.ok) {
    pass('Auth service reachable'); record('pass');
    const settings = authRes.data;
    if (settings?.external?.email) { pass('Email auth enabled'); record('pass'); }
    else { warn('Email auth may be disabled'); record('warn'); }
  } else {
    warn(`Auth settings check failed (${authRes.status})`); record('warn');
  }

  return true;
}

async function checkTables() {
  step('2. Database Tables');

  const requiredTables = [
    'profiles', 'wallets', 'transactions', 'holdings', 'notifications',
    'properties', 'market_data', 'analytics_events', 'image_registry',
    'push_tokens', 'jv_deals', 'landing_analytics', 'waitlist',
  ];

  const chatTables = [
    'conversations', 'conversation_participants', 'messages',
    'chat_rooms', 'room_messages',
  ];

  const optionalTables = [
    'visitor_sessions', 'realtime_snapshots', 'audit_trail',
    'ivx_owner_ai_conversations', 'ivx_owner_ai_messages',
    'ivx_owner_ai_inbox', 'ivx_owner_ai_files',
  ];

  const checkTable = async (table) => {
    const res = await supabaseRequest(`/rest/v1/${table}?select=count&limit=0`, {
      headers: { 'Prefer': 'count=exact' },
    });
    return res.ok || res.status === 200 || res.status === 206;
  };

  info('Checking required tables...');
  for (const table of requiredTables) {
    const exists = await checkTable(table);
    if (exists) { pass(table); record('pass'); }
    else { fail(`${table} — missing or inaccessible`); record('fail'); }
  }

  info('Checking chat tables...');
  for (const table of chatTables) {
    const exists = await checkTable(table);
    if (exists) { pass(`${table} (chat)`); record('pass'); }
    else { warn(`${table} — missing (chat fallback will activate)`); record('warn'); }
  }

  info('Checking optional tables...');
  for (const table of optionalTables) {
    const exists = await checkTable(table);
    if (exists) { pass(`${table} (optional)`); record('pass'); }
    else { info(`${table} — not present (optional)`); }
  }
}

async function checkRLS() {
  step('3. Row Level Security (RLS)');

  if (!SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_KEY === SUPABASE_ANON_KEY) {
    warn('Skipping RLS audit — valid service role key required'); record('warn');
    return;
  }

  const rlsQuery = `
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  const res = await supabaseRequest('/rest/v1/rpc/exec_sql', {
    method: 'POST',
    body: { query: rlsQuery },
    useServiceKey: true,
  });

  if (!res.ok) {
    info('Direct SQL not available — checking RLS via anon access patterns');

    const sensitiveTablesAnon = ['profiles', 'wallets', 'transactions', 'holdings'];
    for (const table of sensitiveTablesAnon) {
      const anonRes = await supabaseRequest(`/rest/v1/${table}?select=*&limit=5`);
      if (anonRes.ok && Array.isArray(anonRes.data) && anonRes.data.length === 0) {
        pass(`${table} — anon returns empty (RLS likely active)`); record('pass');
      } else if (anonRes.ok && Array.isArray(anonRes.data) && anonRes.data.length > 0) {
        fail(`${table} — anon can read ${anonRes.data.length} rows (RLS may be missing)`); record('fail');
      } else {
        warn(`${table} — anon access check inconclusive (${anonRes.status})`); record('warn');
      }
    }

    const anonWriteRes = await supabaseRequest('/rest/v1/profiles', {
      method: 'POST',
      body: { id: '00000000-0000-0000-0000-000000000000', email: 'rls-test@test.com' },
    });
    if (anonWriteRes.status === 401 || anonWriteRes.status === 403 || anonWriteRes.status === 409) {
      pass('profiles — anon write blocked'); record('pass');
    } else if (anonWriteRes.status === 201) {
      fail('profiles — anon write SUCCEEDED (RLS not enforced)'); record('fail');
    } else {
      info(`profiles — anon write returned ${anonWriteRes.status}`);
    }
    return;
  }

  const tables = res.data || [];
  const noRls = tables.filter(t => !t.rowsecurity);
  const withRls = tables.filter(t => t.rowsecurity);

  pass(`${withRls.length} tables have RLS enabled`); record('pass');

  const mustHaveRls = ['profiles', 'wallets', 'transactions', 'holdings', 'conversations', 'messages'];
  for (const table of mustHaveRls) {
    const match = tables.find(t => t.tablename === table);
    if (!match) continue;
    if (match.rowsecurity) { pass(`${table} — RLS enabled`); record('pass'); }
    else { fail(`${table} — RLS NOT enabled (sensitive data exposed)`); record('fail'); }
  }

  if (noRls.length > 0) {
    warn(`Tables without RLS: ${noRls.map(t => t.tablename).join(', ')}`); record('warn');
  }
}

async function checkRealtime() {
  step('4. Realtime');

  const url = SUPABASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
  info(`Realtime endpoint: ${url}/realtime/v1/websocket`);
  pass('Realtime URL derivable from Supabase URL'); record('pass');
  info('Full WebSocket test requires runtime — check from app with useRoomSync');
}

async function checkStorage() {
  step('5. Storage Buckets');

  const res = await supabaseRequest('/storage/v1/bucket', {
    useServiceKey: !!SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY !== SUPABASE_ANON_KEY,
  });

  if (!res.ok) {
    warn(`Storage API returned ${res.status} — bucket check skipped`); record('warn');
    return;
  }

  const buckets = res.data || [];
  info(`Found ${buckets.length} storage bucket(s)`);

  const requiredBuckets = ['chat-uploads', 'deal-photos', 'avatars'];
  for (const name of requiredBuckets) {
    const bucket = buckets.find(b => b.name === name || b.id === name);
    if (bucket) {
      pass(`Bucket: ${name} (public: ${bucket.public})`); record('pass');
      if (name === 'chat-uploads' && bucket.public) {
        warn(`${name} is public — consider making it private for security`); record('warn');
      }
    } else {
      warn(`Bucket missing: ${name} — will need creation`); record('warn');
    }
  }

  const ivxBuckets = buckets.filter(b =>
    b.name?.includes('ivx') || b.name?.includes('owner')
  );
  for (const b of ivxBuckets) {
    if (b.public) {
      fail(`IVX bucket "${b.name}" is PUBLIC — must be private for owner-only data`); record('fail');
    } else {
      pass(`IVX bucket "${b.name}" is private`); record('pass');
    }
  }
}

async function checkFunctions() {
  step('6. Database Functions');

  const requiredFunctions = [
    'is_admin', 'is_owner_of', 'get_user_role', 'verify_admin_access',
  ];

  for (const fn of requiredFunctions) {
    const res = await supabaseRequest(`/rest/v1/rpc/${fn}`, {
      method: 'POST',
      body: {},
    });

    if (res.status === 200 || res.status === 400 || res.status === 422) {
      pass(`Function exists: ${fn}`); record('pass');
    } else if (res.status === 404) {
      fail(`Function missing: ${fn}`); record('fail');
    } else {
      warn(`Function ${fn} returned ${res.status}`); record('warn');
    }
  }
}

async function checkChatReadiness() {
  step('7. Chat System Readiness');

  const chatChecks = [
    { table: 'conversations', desc: 'Chat conversations' },
    { table: 'messages', desc: 'Chat messages' },
    { table: 'conversation_participants', desc: 'Participants' },
    { table: 'realtime_snapshots', desc: 'Realtime snapshots (fallback)' },
  ];

  let chatReady = 0;
  for (const check of chatChecks) {
    const res = await supabaseRequest(`/rest/v1/${check.table}?select=count&limit=0`, {
      headers: { 'Prefer': 'count=exact' },
    });
    if (res.ok) {
      pass(`${check.desc} (${check.table})`); record('pass'); chatReady++;
    } else {
      warn(`${check.desc} (${check.table}) — not accessible`); record('warn');
    }
  }

  if (chatReady >= 3) {
    pass('Chat system has enough tables for shared mode'); record('pass');
  } else if (chatReady >= 1) {
    warn('Chat will use fallback mode (some tables missing)'); record('warn');
  } else {
    warn('Chat will use local-device-only mode'); record('warn');
  }
}

async function main() {
  console.log(`\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
  console.log(`${BOLD}${BLUE}  IVX Holdings — Supabase Production Validation${NC}`);
  console.log(`${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);

  const connected = await checkConnection();
  if (!connected) {
    console.log(`\n${RED}Cannot proceed — Supabase connection failed${NC}\n`);
    process.exit(1);
  }

  await checkTables();
  await checkRLS();
  await checkRealtime();
  await checkStorage();
  await checkFunctions();
  await checkChatReadiness();

  console.log(`\n${BOLD}${CYAN}━━━ Summary ━━━${NC}`);
  console.log(`  ${GREEN}Pass: ${passCount}${NC}  ${YELLOW}Warn: ${warnCount}${NC}  ${RED}Fail: ${failCount}${NC}`);

  const overall = failCount === 0 ? (warnCount === 0 ? 'PRODUCTION READY' : 'READY WITH WARNINGS') : 'NOT PRODUCTION READY';
  const color = failCount === 0 ? GREEN : RED;
  console.log(`\n  ${BOLD}${color}Overall: ${overall}${NC}\n`);

  if (failCount > 0) {
    console.log(`  ${YELLOW}Fix the FAIL items above before going to production.${NC}\n`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}Validation error: ${err.message}${NC}`);
  process.exit(1);
});
