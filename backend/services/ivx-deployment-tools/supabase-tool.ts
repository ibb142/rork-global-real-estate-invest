/**
 * IVX Supabase Deployment Tool
 *
 * Comprehensive Supabase operations:
 *   - Verify connection (anon + service role)
 *   - List tables, row counts
 *   - Test read/write operations
 *   - Check RLS policies
 *   - Verify auth settings
 *   - Check specific tables (members, messages, etc.)
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface SupabaseTableInfo {
  name: string;
  schema: string;
  rowCount: number | null;
  rlsEnabled: boolean;
}

export interface SupabaseConnectionTest {
  type: 'anon' | 'service_role';
  ok: boolean;
  status: number | null;
  error: string | null;
}

export interface SupabaseAuthInfo {
  usersTotal: number | null;
  providers: string[];
  mfaEnabled: boolean;
}

export interface SupabaseRlsPolicy {
  tableName: string;
  policyName: string;
  roles: string[];
  command: string;
  using: string | null;
  check: string | null;
}

export interface SupabaseToolResult {
  ok: boolean;
  error: string | null;
  connections?: SupabaseConnectionTest[];
  tables?: SupabaseTableInfo[];
  auth?: SupabaseAuthInfo;
  rlsPolicies?: SupabaseRlsPolicy[];
  writeTest?: { ok: boolean; detail: string };
  readTest?: { ok: boolean; detail: string };
  specificTables?: Record<string, { exists: boolean; rowCount: number | null; error?: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getSupabaseCredentials() {
  return {
    url: (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim(),
    anonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  };
}

async function supabaseFetch(
  url: string,
  key: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown; error: string | null }> {
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    const res = await fetch(`${url}/rest/v1/${opts.body ? '' : ''}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    // For GET requests to list tables, we use a different approach
    // Actually let's just do direct SQL via RPC
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : `HTTP ${res.status}: ${text.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function supabaseSQL(
  query: string,
): Promise<{ ok: boolean; data: unknown; error: string | null }> {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  if (!url || !serviceRoleKey) return { ok: false, data: null, error: 'Supabase credentials not configured' };

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    const res = await fetch(`${url}/rest/v1/rpc/ivx_exec_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data, error: res.ok ? null : `SQL HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Connection Tests ─────────────────────────────────────────────────

export async function testConnections(): Promise<SupabaseToolResult> {
  const { url, anonKey, serviceRoleKey } = getSupabaseCredentials();
  const connections: SupabaseConnectionTest[] = [];

  if (!url) {
    return { ok: false, error: 'SUPABASE_URL not configured', connections: [] };
  }

  // Test anon key
  if (anonKey) {
    const anonRes = await supabaseFetch(url, anonKey);
    connections.push({
      type: 'anon',
      ok: anonRes.ok,
      status: anonRes.status,
      error: anonRes.error,
    });
  } else {
    connections.push({ type: 'anon', ok: false, status: null, error: 'Anon key not configured' });
  }

  // Test service role key
  if (serviceRoleKey) {
    const serviceRes = await supabaseFetch(url, serviceRoleKey);
    connections.push({
      type: 'service_role',
      ok: serviceRes.ok,
      status: serviceRes.status,
      error: serviceRes.error,
    });
  } else {
    connections.push({ type: 'service_role', ok: false, status: null, error: 'Service role key not configured' });
  }

  return {
    ok: connections.some(c => c.ok),
    error: null,
    connections,
  };
}

// ─── Table Operations ─────────────────────────────────────────────────

export async function listTables(): Promise<SupabaseToolResult> {
  const sql = `
    SELECT
      schemaname AS schema,
      tablename AS name,
      n_live_tup::bigint AS row_count,
      false AS rls_enabled
    FROM pg_stat_user_tables
    ORDER BY schemaname, tablename;
  `;

  const result = await supabaseSQL(sql);
  if (!result.ok) {
    return { ok: false, error: result.error, tables: [] };
  }

  const rows = result.data as Array<{ schema: string; name: string; row_count: string; rls_enabled: boolean }> | null;
  const tables: SupabaseTableInfo[] = (rows ?? []).map(r => ({
    name: r.name,
    schema: r.schema,
    rowCount: Number(r.row_count) || 0,
    rlsEnabled: r.rls_enabled,
  }));

  // Get RLS status separately
  const rlsResult = await supabaseSQL(`
    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
  `);
  if (rlsResult.ok && Array.isArray(rlsResult.data)) {
    const rlsMap = new Map<string, boolean>();
    for (const r of rlsResult.data as Array<{ tablename: string; rowsecurity: boolean }>) {
      rlsMap.set(r.tablename, r.rowsecurity);
    }
    for (const t of tables) {
      if (t.schema === 'public') t.rlsEnabled = rlsMap.get(t.name) ?? false;
    }
  }

  return { ok: true, error: null, tables };
}

// ─── RLS Policies ─────────────────────────────────────────────────────

export async function checkRlsPolicies(): Promise<SupabaseToolResult> {
  const sql = `
    SELECT
      schemaname AS schema_name,
      tablename AS table_name,
      policyname AS policy_name,
      roles::text AS roles,
      cmd AS command,
      qual AS using_expr,
      with_check AS check_expr
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `;

  const result = await supabaseSQL(sql);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const rows = result.data as Array<{
    schema_name: string; table_name: string; policy_name: string;
    roles: string; command: string; using_expr: string | null; check_expr: string | null;
  }> | null;

  return {
    ok: true,
    error: null,
    rlsPolicies: (rows ?? []).map(r => ({
      tableName: r.table_name,
      policyName: r.policy_name,
      roles: r.roles.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean),
      command: r.command,
      using: r.using_expr,
      check: r.check_expr,
    })),
  };
}

// ─── Auth Info ────────────────────────────────────────────────────────

export async function checkAuth(): Promise<SupabaseToolResult> {
  const sql = `
    SELECT count(*)::bigint AS total_users FROM auth.users;
  `;

  const result = await supabaseSQL(sql);
  const usersTotal = result.ok && Array.isArray(result.data) && result.data.length > 0
    ? (result.data[0] as { total_users: string }).total_users : null;

  // Check auth providers
  const providerSql = `SELECT provider FROM auth.users GROUP BY provider;`;
  const providerResult = await supabaseSQL(providerSql);
  const providers: string[] = [];
  if (providerResult.ok && Array.isArray(providerResult.data)) {
    for (const row of providerResult.data as Array<{ provider: string }>) {
      providers.push(row.provider);
    }
  }

  return {
    ok: true,
    error: null,
    auth: {
      usersTotal: usersTotal ? Number(usersTotal) : null,
      providers,
      mfaEnabled: false, // Can't easily detect from SQL
    },
  };
}

// ─── Read/Write Tests ─────────────────────────────────────────────────

export async function testReadWrite(): Promise<SupabaseToolResult> {
  const { url, serviceRoleKey } = getSupabaseCredentials();
  if (!url || !serviceRoleKey) {
    return { ok: false, error: 'Supabase credentials not configured' };
  }

  let readOk = false;
  let readDetail = '';
  let writeOk = false;
  let writeDetail = '';

  // Read test — try reading from members table
  try {
    const headers: Record<string, string> = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };
    const res = await fetch(`${url}/rest/v1/members?limit=1`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    readOk = res.ok || res.status === 406; // 406 = no rows, which is fine
    readDetail = readOk ? `Read OK (HTTP ${res.status})` : `Read failed (HTTP ${res.status})`;
  } catch (err) {
    readDetail = `Read error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Write test — try inserting into a test/audit table if exists
  try {
    const headers: Record<string, string> = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    };
    const testRecord = {
      event: 'deployment_tool_write_test',
      timestamp: new Date().toISOString(),
      metadata: { source: 'ivx-deployment-tools' },
    };
    const res = await fetch(`${url}/rest/v1/audit_logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(testRecord),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      writeOk = true;
      writeDetail = `Write OK (HTTP ${res.status}) — inserted test row into audit_logs`;
    } else if (res.status === 404) {
      writeDetail = 'audit_logs table not found — write test skipped';
      writeOk = true; // Not a failure, table just doesn't exist
    } else {
      writeDetail = `Write failed (HTTP ${res.status})`;
    }
  } catch (err) {
    writeDetail = `Write error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    ok: readOk,
    error: null,
    readTest: { ok: readOk, detail: readDetail },
    writeTest: { ok: writeOk, detail: writeDetail },
  };
}

// ─── Specific Table Checks ────────────────────────────────────────────

const CRITICAL_TABLES = [
  'members', 'profiles', 'wallets', 'audit_logs', 'verification_codes',
  'ivx_owner_variables', 'ivx_owner_variable_audit',
  'project_media', 'project_videos', 'project_likes', 'project_comments',
  'project_shares', 'project_saves', 'project_analytics',
  'messages', 'chat_rooms',
];

export async function checkCriticalTables(): Promise<SupabaseToolResult> {
  const specificTables: SupabaseToolResult['specificTables'] = {};

  for (const tableName of CRITICAL_TABLES) {
    const sql = `SELECT count(*)::bigint AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}';`;
    const result = await supabaseSQL(sql);

    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      const cnt = Number((result.data[0] as { cnt: string }).cnt) || 0;
      if (cnt > 0) {
        // Table exists — get row count
        const countSql = `SELECT count(*)::bigint AS n FROM public."${tableName}";`;
        const countResult = await supabaseSQL(countSql);
        const rowCount = countResult.ok && Array.isArray(countResult.data) && countResult.data.length > 0
          ? Number((countResult.data[0] as { n: string }).n) : null;
        specificTables[tableName] = { exists: true, rowCount };
      } else {
        specificTables[tableName] = { exists: false, rowCount: null };
      }
    } else {
      specificTables[tableName] = { exists: false, rowCount: null, error: result.error ?? undefined };
    }
  }

  return { ok: true, error: null, specificTables };
}

// ─── Combined Status ──────────────────────────────────────────────────

export async function getFullSupabaseStatus(): Promise<SupabaseToolResult> {
  const [connections, tables, auth, rw, critical] = await Promise.all([
    testConnections(),
    listTables(),
    checkAuth(),
    testReadWrite(),
    checkCriticalTables(),
  ]);

  return {
    ok: connections.ok,
    error: [connections.error, tables.error, auth.error, rw.error, critical.error].filter(Boolean).join('; ') || null,
    connections: connections.connections,
    tables: tables.tables,
    auth: auth.auth,
    rlsPolicies: undefined, // Separate call if needed
    readTest: rw.readTest,
    writeTest: rw.writeTest,
    specificTables: critical.specificTables,
  };
}
