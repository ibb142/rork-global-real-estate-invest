import { Client } from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './aws-runtime.mjs';
import {
  ensureOwnerSession,
  executeSupabaseSqlScriptAsOwner,
  querySupabaseRestAsOwner,
  readTrimmed,
  nowIso,
  redactSensitiveValue,
} from './ivx-owner-auth.mjs';

const envLoadResult = loadProjectEnv(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const REPORT_DIR = resolve(PROJECT_ROOT, 'logs/deploy');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_BASENAME = `ivx-owner-room-repair-${RUN_TIMESTAMP}`;
const REPORT_JSON_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.json`);
const REPORT_MD_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.md`);
const PHASE1_SQL_PATH = resolve(PROJECT_ROOT, 'expo/supabase/ivx-owner-ai-phase1.sql');
const DEDUPE_SQL_PATH = resolve(PROJECT_ROOT, 'expo/supabase/ivx-owner-room-dedupe.sql');
const REQUEST_TIMEOUT_MS = Number.parseInt(readTrimmed(process.env.IVX_OWNER_ROOM_REPAIR_TIMEOUT_MS) || '15000', 10);
const SUPABASE_URL = readTrimmed(process.env.SUPABASE_URL) || readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_ROLE_KEY = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_DB_PASSWORD = readTrimmed(process.env.SUPABASE_DB_PASSWORD);
const SUPABASE_DB_URL = readTrimmed(process.env.SUPABASE_DB_URL)
  || readTrimmed(process.env.DATABASE_URL)
  || readTrimmed(process.env.SUPABASE_POOLER_URL);
const PROJECT_REF = extractProjectRef(SUPABASE_URL);
const DIRECT_DB_HOST = readTrimmed(process.env.SUPABASE_DIRECT_DB_HOST) || (PROJECT_REF ? `db.${PROJECT_REF}.supabase.co` : '');
const DIRECT_DB_PORT = Number.parseInt(readTrimmed(process.env.SUPABASE_DIRECT_DB_PORT) || '5432', 10);
const DIRECT_DB_USER = readTrimmed(process.env.SUPABASE_DIRECT_DB_USER) || 'postgres';
const DIRECT_DB_NAME = readTrimmed(process.env.SUPABASE_DIRECT_DB_NAME) || 'postgres';
const OWNER_ROOM_ID = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
const OWNER_PROOF_EMAIL = readTrimmed(process.env.IVX_OWNER_PROOF_EMAIL);
const OWNER_PROOF_PASSWORD = readTrimmed(process.env.IVX_OWNER_PROOF_PASSWORD);
const OWNER_PROOF_FIRST_NAME = readTrimmed(process.env.IVX_OWNER_PROOF_FIRST_NAME) || 'IVX';
const OWNER_PROOF_LAST_NAME = readTrimmed(process.env.IVX_OWNER_PROOF_LAST_NAME) || 'Owner';

function extractProjectRef(url) {
  const normalized = readTrimmed(url).replace(/^https?:\/\//i, '');
  return normalized ? normalized.split('.')[0] ?? '' : '';
}

function decodeJwtPayload(token) {
  const normalized = readTrimmed(token);
  if (!normalized || !normalized.includes('.')) {
    return null;
  }

  try {
    const payloadSegment = normalized.split('.')[1] ?? '';
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function truncate(value, maxLength = 600) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 40)}… truncated`;
}

function classifyRestResult(result) {
  if (result.ok) {
    return 'reachable';
  }
  if (result.status === 404) {
    return 'missing_relation';
  }
  if (result.status === 401 || result.status === 403) {
    return 'permission_denied';
  }
  if (result.status === 400) {
    return 'schema_mismatch';
  }
  if (result.status === 0) {
    return 'request_failed';
  }
  return 'error';
}

function getServiceKeyAudit() {
  const anonPayload = decodeJwtPayload(SUPABASE_ANON_KEY);
  const servicePayload = decodeJwtPayload(SUPABASE_SERVICE_ROLE_KEY);
  const anonRole = readTrimmed(anonPayload?.role);
  const serviceRole = readTrimmed(servicePayload?.role);
  return {
    anonConfigured: SUPABASE_ANON_KEY.length > 0,
    serviceConfigured: SUPABASE_SERVICE_ROLE_KEY.length > 0,
    matchesAnon: SUPABASE_SERVICE_ROLE_KEY.length > 0 && SUPABASE_SERVICE_ROLE_KEY === SUPABASE_ANON_KEY,
    anonRole: anonRole || null,
    serviceRole: serviceRole || null,
    hasRealServiceRole: serviceRole === 'service_role' && SUPABASE_SERVICE_ROLE_KEY !== SUPABASE_ANON_KEY,
  };
}

function getOwnerSessionRole(ownerSession) {
  const rows = Array.isArray(ownerSession?.profileReadback?.data) ? ownerSession.profileReadback.data : [];
  const firstRow = rows[0] && typeof rows[0] === 'object' ? rows[0] : null;
  const profileRole = typeof firstRow?.role === 'string' ? firstRow.role.trim().toLowerCase() : '';
  if (profileRole) {
    return profileRole;
  }

  const attempts = Array.isArray(ownerSession?.attempts) ? ownerSession.attempts : [];
  const latestAttemptWithUser = [...attempts].reverse().find((attempt) => attempt?.json?.user && typeof attempt.json.user === 'object');
  const authUser = latestAttemptWithUser?.json?.user ?? null;
  const appMetadataRole = typeof authUser?.app_metadata?.role === 'string' ? authUser.app_metadata.role.trim().toLowerCase() : '';
  if (appMetadataRole) {
    return appMetadataRole;
  }

  const userMetadataRole = typeof authUser?.user_metadata?.role === 'string' ? authUser.user_metadata.role.trim().toLowerCase() : '';
  if (userMetadataRole) {
    return userMetadataRole;
  }

  return null;
}

function isOwnerSessionReady(ownerSession) {
  return Boolean(ownerSession?.ok && ownerSession.accessToken && ownerSession.userId && getOwnerSessionRole(ownerSession) === 'owner');
}

function getRestAuthMode(serviceKeyAudit, ownerSession) {
  if (serviceKeyAudit.hasRealServiceRole) {
    return 'service_role';
  }

  if (isOwnerSessionReady(ownerSession)) {
    return 'owner_session';
  }

  return 'none';
}

async function queryRestWithAuth(path, authInput) {
  if (!SUPABASE_URL) {
    return {
      ok: false,
      status: 0,
      classification: 'request_failed',
      data: null,
      error: 'Supabase URL is missing.',
      authMode: authInput.mode,
    };
  }

  if (authInput.mode === 'service_role') {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${SUPABASE_URL}${path}`, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: 'application/json',
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      return {
        ok: response.ok,
        status: response.status,
        durationMs: Date.now() - startedAt,
        classification: classifyRestResult({ ok: response.ok, status: response.status }),
        data,
        error: response.ok ? null : truncate(text),
        authMode: authInput.mode,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        durationMs: Date.now() - startedAt,
        classification: 'request_failed',
        data: null,
        error: error instanceof Error ? error.message : 'request failed',
        authMode: authInput.mode,
      };
    }
  }

  if (authInput.mode === 'owner_session' && authInput.accessToken) {
    const result = await querySupabaseRestAsOwner({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: authInput.accessToken,
      timeoutMs: REQUEST_TIMEOUT_MS,
      path,
    });

    return {
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      classification: classifyRestResult({ ok: result.ok, status: result.status }),
      data: result.json,
      error: result.error ?? (!result.ok ? truncate(result.text) : null),
      authMode: authInput.mode,
    };
  }

  return {
    ok: false,
    status: 0,
    classification: 'request_failed',
    data: null,
    error: 'No usable REST auth mode is available.',
    authMode: authInput.mode,
  };
}

async function probeRestTables(authInput) {
  console.log('[IVXOwnerRoomRepair] Probing Supabase REST table reachability', { authMode: authInput.mode });
  return {
    authMode: authInput.mode,
    ownerConversation: await queryRestWithAuth('/rest/v1/ivx_conversations?select=id,slug,title&slug=eq.ivx-owner-room&limit=1', authInput),
    messages: await queryRestWithAuth(`/rest/v1/ivx_messages?select=id,conversation_id,sender_role&conversation_id=eq.${OWNER_ROOM_ID}&limit=1`, authInput),
    aiRequests: await queryRestWithAuth(`/rest/v1/ivx_ai_requests?select=id,request_id,conversation_id&conversation_id=eq.${OWNER_ROOM_ID}&limit=1`, authInput),
    inboxState: await queryRestWithAuth(`/rest/v1/ivx_inbox_state?select=conversation_id,user_id&conversation_id=eq.${OWNER_ROOM_ID}&limit=1`, authInput),
  };
}

function parseConnectionString(connectionString) {
  const normalized = readTrimmed(connectionString);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return {
      connectionString: normalized,
      host: readTrimmed(parsed.hostname),
      port: parsed.port ? Number.parseInt(parsed.port, 10) : null,
      user: decodeURIComponent(parsed.username || ''),
      database: readTrimmed(parsed.pathname.replace(/^\//, '')) || 'postgres',
    };
  } catch {
    return null;
  }
}

function getPgConnectionConfig() {
  const parsedUrl = parseConnectionString(SUPABASE_DB_URL);
  if (parsedUrl) {
    return {
      source: 'connection_string',
      host: parsedUrl.host,
      port: parsedUrl.port ?? 5432,
      user: parsedUrl.user || 'postgres',
      database: parsedUrl.database || 'postgres',
      connectionString: SUPABASE_DB_URL,
    };
  }

  if (!DIRECT_DB_HOST || !SUPABASE_DB_PASSWORD) {
    return null;
  }

  return {
    source: 'derived_direct_host',
    host: DIRECT_DB_HOST,
    port: Number.isFinite(DIRECT_DB_PORT) ? DIRECT_DB_PORT : 5432,
    user: DIRECT_DB_USER,
    database: DIRECT_DB_NAME,
    connectionString: null,
  };
}

function isLocalPostgresHost(host) {
  const normalizedHost = readTrimmed(host).toLowerCase();
  return normalizedHost === '127.0.0.1' || normalizedHost === 'localhost' || normalizedHost === '::1';
}

function buildPgClient() {
  const connection = getPgConnectionConfig();
  if (!connection) {
    return null;
  }

  const ssl = isLocalPostgresHost(connection.host) ? false : { rejectUnauthorized: false };

  return new Client(connection.connectionString
    ? {
        connectionString: connection.connectionString,
        ssl,
        connectionTimeoutMillis: REQUEST_TIMEOUT_MS,
        statement_timeout: 60000,
        query_timeout: 60000,
      }
    : {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: SUPABASE_DB_PASSWORD,
        database: connection.database,
        ssl,
        connectionTimeoutMillis: REQUEST_TIMEOUT_MS,
        statement_timeout: 60000,
        query_timeout: 60000,
      });
}

async function runSqlFile(client, filePath) {
  const sql = await readFile(filePath, 'utf8');
  const startedAt = Date.now();
  console.log('[IVXOwnerRoomRepair] Applying SQL file via Postgres', { filePath: relative(PROJECT_ROOT, filePath) });
  await client.query(sql);
  return {
    filePath: relative(PROJECT_ROOT, filePath),
    ok: true,
    durationMs: Date.now() - startedAt,
  };
}

async function fetchPgSummary(client) {
  const tableRows = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('ivx_conversations', 'ivx_messages', 'ivx_inbox_state', 'ivx_ai_requests')
    order by table_name asc
  `);
  const columnRows = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'ivx_messages' and column_name = 'conversation_id')
        or (table_name = 'ivx_ai_requests' and column_name = 'request_id')
        or (table_name = 'ivx_conversations' and column_name = 'slug')
      )
    order by table_name asc, column_name asc
  `);
  const counts = await client.query(`
    select
      (select count(*)::int from public.ivx_conversations where slug = 'ivx-owner-room') as owner_room_rows,
      (select count(*)::int from public.ivx_messages where conversation_id = '${OWNER_ROOM_ID}'::uuid) as owner_message_rows,
      (select count(*)::int from public.ivx_ai_requests where conversation_id = '${OWNER_ROOM_ID}'::uuid) as owner_ai_request_rows,
      (select count(*)::int from public.ivx_inbox_state where conversation_id = '${OWNER_ROOM_ID}'::uuid) as owner_inbox_rows
  `);

  return {
    tables: tableRows.rows,
    columns: columnRows.rows,
    counts: counts.rows[0] ?? null,
  };
}

async function attemptDirectPgRepair() {
  const connection = getPgConnectionConfig();
  const client = buildPgClient();
  if (!client || !connection) {
    return {
      ok: false,
      attempted: false,
      connected: false,
      connectionSource: null,
      host: DIRECT_DB_HOST || null,
      port: Number.isFinite(DIRECT_DB_PORT) ? DIRECT_DB_PORT : 5432,
      user: DIRECT_DB_USER || null,
      database: DIRECT_DB_NAME || null,
      appliedFiles: [],
      summary: null,
      error: SUPABASE_DB_URL
        ? 'SUPABASE_DB_URL is set but could not be parsed.'
        : !DIRECT_DB_HOST
          ? 'Direct Supabase Postgres host could not be derived from EXPO_PUBLIC_SUPABASE_URL.'
          : 'SUPABASE_DB_PASSWORD is missing.',
    };
  }

  const appliedFiles = [];
  try {
    console.log('[IVXOwnerRoomRepair] Connecting to Postgres directly', {
      connectionSource: connection.source,
      host: connection.host,
      port: connection.port,
      user: connection.user,
      database: connection.database,
    });
    await client.connect();
    const connectionCheck = await client.query('select current_database() as database_name, current_user as current_user');
    appliedFiles.push(await runSqlFile(client, PHASE1_SQL_PATH));
    appliedFiles.push(await runSqlFile(client, DEDUPE_SQL_PATH));
    const summary = await fetchPgSummary(client);
    return {
      ok: true,
      attempted: true,
      connected: true,
      connectionSource: connection.source,
      host: connection.host,
      port: connection.port,
      user: connection.user,
      database: connection.database,
      connectionCheck: connectionCheck.rows[0] ?? null,
      appliedFiles,
      summary,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      attempted: true,
      connected: false,
      connectionSource: connection.source,
      host: connection.host,
      port: connection.port,
      user: connection.user,
      database: connection.database,
      appliedFiles,
      summary: null,
      error: error instanceof Error ? error.message : 'Direct Postgres repair failed.',
      code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null,
      name: typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : 'Error',
    };
  } finally {
    try {
      await client.end();
    } catch {
    }
  }
}

async function attemptOwnerRpcRepair(ownerSession) {
  if (!isOwnerSessionReady(ownerSession)) {
    return {
      ok: false,
      attempted: false,
      steps: [],
      identity: ownerSession?.identity ?? null,
      userId: ownerSession?.userId ?? null,
      error: ownerSession?.error ?? 'No real owner-authenticated session is available.',
    };
  }

  try {
    console.log('[IVXOwnerRoomRepair] Applying owner-room SQL via ivx_exec_sql RPC', {
      userId: ownerSession.userId,
      email: ownerSession.identity?.email ?? null,
    });
    const phase1 = await executeSupabaseSqlScriptAsOwner({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: ownerSession.accessToken,
      timeoutMs: REQUEST_TIMEOUT_MS,
      filePath: PHASE1_SQL_PATH,
    });
    const dedupe = await executeSupabaseSqlScriptAsOwner({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: ownerSession.accessToken,
      timeoutMs: REQUEST_TIMEOUT_MS,
      filePath: DEDUPE_SQL_PATH,
    });

    return {
      ok: true,
      attempted: true,
      identity: ownerSession.identity,
      userId: ownerSession.userId,
      steps: [
        {
          filePath: relative(PROJECT_ROOT, PHASE1_SQL_PATH),
          totalSteps: phase1.totalSteps,
          stepResults: phase1.steps,
        },
        {
          filePath: relative(PROJECT_ROOT, DEDUPE_SQL_PATH),
          totalSteps: dedupe.totalSteps,
          stepResults: dedupe.steps,
        },
      ],
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      attempted: true,
      identity: ownerSession.identity,
      userId: ownerSession.userId,
      steps: [],
      error: error instanceof Error ? error.message : 'Owner RPC repair failed.',
    };
  }
}

function buildExactBlocker(input) {
  if (!SUPABASE_URL) {
    return 'EXPO_PUBLIC_SUPABASE_URL is missing.';
  }

  if (input.postRest.ownerConversation.ok && input.postRest.messages.ok && input.postRest.aiRequests.ok && input.postRest.inboxState.ok) {
    return null;
  }

  if (input.ownerRpcRepair.attempted && input.ownerRpcRepair.ok) {
    return 'Owner RPC schema repair ran, but one or more IVX owner-room relations still did not become readable over Supabase REST.';
  }

  if (!isOwnerSessionReady(input.ownerSession)) {
    const role = getOwnerSessionRole(input.ownerSession);
    if (input.ownerSession?.ok && role !== 'owner') {
      return `A real Supabase session was created, but the profile role did not resolve to owner (current role: ${role ?? 'missing'}).`;
    }
    return input.ownerSession?.error || 'Could not obtain a real owner-authenticated Supabase session for internal IVX repair.';
  }

  if (input.ownerRpcRepair.attempted && !input.ownerRpcRepair.ok) {
    return `Owner-session SQL repair failed: ${input.ownerRpcRepair.error}`;
  }

  if (input.serviceKeyAudit.hasRealServiceRole) {
    if (!SUPABASE_DB_PASSWORD && !SUPABASE_DB_URL) {
      return 'A real service-role key is available, but no direct or pooled Postgres connection details are configured for SQL repair fallback.';
    }
    if (input.pgRepair.attempted && !input.pgRepair.ok) {
      if (input.pgRepair.code === 'ENETUNREACH') {
        return `Direct Postgres repair is blocked by network reachability to ${DIRECT_DB_HOST}:5432 (${input.pgRepair.error}).`;
      }
      return `Direct Postgres repair failed: ${input.pgRepair.error}`;
    }
  }

  if (!input.serviceKeyAudit.hasRealServiceRole) {
    return 'SUPABASE_SERVICE_ROLE_KEY is still not a real service_role JWT. Internal completion now depends on the owner-session repair path succeeding.';
  }

  return 'IVX owner-room repair is still blocked by unresolved storage access.';
}

function buildMarkdown(report) {
  const lines = [
    '# IVX owner room repair report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- JSON: ${report.reportJsonPathRelative}`,
    `- Markdown: ${report.reportMdPathRelative}`,
    '',
    '## Summary',
    '',
    `- Complete: ${report.summary.complete ? 'YES' : 'NO'}`,
    `- Exact blocker: ${report.summary.exactBlocker ?? 'none'}`,
    `- Active REST auth mode: ${report.summary.restAuthMode}`,
    `- Owner session ready: ${report.summary.ownerSessionReady ? 'YES' : 'NO'}`,
    `- Owner RPC repair attempted: ${report.summary.ownerRpcRepairAttempted ? 'YES' : 'NO'}`,
    `- Owner RPC repair succeeded: ${report.summary.ownerRpcRepairSucceeded ? 'YES' : 'NO'}`,
    `- Direct Postgres repair attempted: ${report.summary.pgRepairAttempted ? 'YES' : 'NO'}`,
    `- Direct Postgres repair succeeded: ${report.summary.pgRepairSucceeded ? 'YES' : 'NO'}`,
    '',
    '## Service key audit',
    '',
    '```json',
    JSON.stringify(report.serviceKeyAudit, null, 2),
    '```',
    '',
    '## Owner session',
    '',
    '```json',
    JSON.stringify(report.ownerSession, null, 2),
    '```',
    '',
    '## REST before repair',
    '',
    '```json',
    JSON.stringify(report.preRest, null, 2),
    '```',
    '',
    '## Owner RPC repair',
    '',
    '```json',
    JSON.stringify(report.ownerRpcRepair, null, 2),
    '```',
    '',
    '## Direct Postgres repair',
    '',
    '```json',
    JSON.stringify(report.pgRepair, null, 2),
    '```',
    '',
    '## REST after repair',
    '',
    '```json',
    JSON.stringify(report.postRest, null, 2),
    '```',
    '',
  ];

  return lines.join('\n');
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });

  const serviceKeyAudit = getServiceKeyAudit();
  console.log('[IVXOwnerRoomRepair] Service key audit', serviceKeyAudit);

  const ownerSession = SUPABASE_URL && SUPABASE_ANON_KEY
    ? await ensureOwnerSession({
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        email: OWNER_PROOF_EMAIL,
        password: OWNER_PROOF_PASSWORD,
        firstName: OWNER_PROOF_FIRST_NAME,
        lastName: OWNER_PROOF_LAST_NAME,
        label: 'ivx-owner-repair',
        timeoutMs: REQUEST_TIMEOUT_MS,
      })
    : {
        ok: false,
        identity: null,
        attempts: [],
        accessToken: null,
        userId: null,
        profileUpsert: null,
        profileReadback: null,
        error: 'Supabase public auth env is missing.',
      };

  console.log('[IVXOwnerRoomRepair] Owner session audit', {
    ok: ownerSession.ok,
    userId: ownerSession.userId,
    email: ownerSession.identity?.email ?? null,
    role: getOwnerSessionRole(ownerSession),
    mode: ownerSession.identity?.mode ?? null,
    error: ownerSession.error,
  });

  const preRestAuth = { mode: getRestAuthMode(serviceKeyAudit, ownerSession), accessToken: ownerSession.accessToken ?? null };
  const preRest = await probeRestTables(preRestAuth);

  const needsSchemaRepair = !preRest.ownerConversation.ok || !preRest.messages.ok || !preRest.aiRequests.ok || !preRest.inboxState.ok;
  const ownerRpcRepair = needsSchemaRepair
    ? await attemptOwnerRpcRepair(ownerSession)
    : {
        ok: true,
        attempted: false,
        steps: [],
        identity: ownerSession.identity ?? null,
        userId: ownerSession.userId ?? null,
        error: null,
      };

  const pgRepair = needsSchemaRepair && !ownerRpcRepair.ok
    ? await attemptDirectPgRepair()
    : {
        ok: ownerRpcRepair.ok,
        attempted: false,
        connected: false,
        connectionSource: null,
        host: DIRECT_DB_HOST || null,
        port: Number.isFinite(DIRECT_DB_PORT) ? DIRECT_DB_PORT : 5432,
        user: DIRECT_DB_USER || null,
        database: DIRECT_DB_NAME || null,
        appliedFiles: [],
        summary: null,
        error: ownerRpcRepair.ok ? 'Skipped because owner-session SQL repair succeeded or was not required.' : 'Skipped because owner-session repair already provided the primary diagnostic.',
      };

  const postRestAuth = { mode: getRestAuthMode(serviceKeyAudit, ownerSession), accessToken: ownerSession.accessToken ?? null };
  const postRest = await probeRestTables(postRestAuth);
  const exactBlocker = buildExactBlocker({ serviceKeyAudit, ownerSession, ownerRpcRepair, pgRepair, postRest });

  const report = {
    generatedAt: nowIso(),
    reportJsonPathRelative: relative(PROJECT_ROOT, REPORT_JSON_PATH),
    reportMdPathRelative: relative(PROJECT_ROOT, REPORT_MD_PATH),
    env: {
      loadedEnvFiles: envLoadResult.loadedEnvFilesRelative,
    },
    supabase: {
      url: SUPABASE_URL || null,
      projectRef: PROJECT_REF || null,
      directDbHost: DIRECT_DB_HOST || null,
      directDbPort: Number.isFinite(DIRECT_DB_PORT) ? DIRECT_DB_PORT : null,
      directDbUser: DIRECT_DB_USER || null,
      hasDbPassword: SUPABASE_DB_PASSWORD.length > 0,
      hasDbUrl: SUPABASE_DB_URL.length > 0,
    },
    serviceKeyAudit,
    ownerSession: {
      ok: ownerSession.ok,
      ready: isOwnerSessionReady(ownerSession),
      userId: ownerSession.userId,
      email: ownerSession.identity?.email ?? null,
      mode: ownerSession.identity?.mode ?? null,
      role: getOwnerSessionRole(ownerSession),
      profileUpsert: ownerSession.profileUpsert,
      profileReadback: ownerSession.profileReadback,
      attempts: ownerSession.attempts,
      error: ownerSession.error,
    },
    preRest,
    ownerRpcRepair,
    pgRepair,
    postRest,
    summary: {
      complete: exactBlocker === null,
      exactBlocker,
      restAuthMode: postRest.authMode,
      ownerSessionReady: isOwnerSessionReady(ownerSession),
      ownerRpcRepairAttempted: ownerRpcRepair.attempted,
      ownerRpcRepairSucceeded: ownerRpcRepair.ok,
      pgRepairAttempted: pgRepair.attempted,
      pgRepairSucceeded: pgRepair.ok,
    },
  };

  const safeReport = redactSensitiveValue(report);
  await writeFile(REPORT_JSON_PATH, `${JSON.stringify(safeReport, null, 2)}\n`);
  await writeFile(REPORT_MD_PATH, `${buildMarkdown(safeReport)}\n`);
  console.log(JSON.stringify(safeReport, null, 2));

  if (exactBlocker) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error('[IVXOwnerRoomRepair] Fatal error', error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
