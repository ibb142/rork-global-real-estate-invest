import { supabase } from '@/lib/supabase';
import { runStorageIntegrityCheck } from '@/lib/project-storage';

/**
 * startup-health.ts — Lightweight health check for app startup.
 * Use this for quick startup validation (5 checks, <3s).
 *
 * For comprehensive system monitoring (14 checks + connection graph),
 * use system-health-checker.ts instead (via the System Health screen).
 *
 * Consolidation note: These two files serve different purposes:
 *   - startup-health.ts → fast, runs on every app launch
 *   - system-health-checker.ts → detailed, runs on-demand from admin UI
 */

export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  checks: {
    supabaseConnection: CheckStatus;
    supabaseTables: CheckStatus;
    storageIntegrity: CheckStatus;
    authService: CheckStatus;
    realtimeChannel: CheckStatus;
  };
  warnings: string[];
  errors: string[];
}

interface CheckStatus {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  latencyMs?: number;
}

const REQUIRED_TABLES = ['profiles', 'wallets', 'transactions', 'holdings', 'notifications'] as const;
const OPTIONAL_TABLES = ['jv_deals', 'audit_trail', 'waitlist'] as const;

async function checkSupabaseConnection(): Promise<CheckStatus> {
  const start = Date.now();
  try {
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'Connection check timeout 3s' } }), 3000)
    );
    const { error } = await Promise.race([supabase.from('profiles').select('id').limit(1), timeoutPromise]) as any;
    const latency = Date.now() - start;
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find') || msg.includes('schema cache')) {
        return { status: 'warn', message: 'Connected but profiles table missing', latencyMs: latency };
      }
      return { status: 'warn', message: `Query error: ${error.message}`, latencyMs: latency };
    }
    return { status: 'pass', message: `Connected (${latency}ms)`, latencyMs: latency };
  } catch (err) {
    return { status: 'fail', message: `Connection failed: ${(err as Error)?.message}`, latencyMs: Date.now() - start };
  }
}

async function checkSupabaseTables(): Promise<CheckStatus> {
  const missing: string[] = [];
  const found: string[] = [];

  const checkTable = async (table: string): Promise<{ table: string; exists: boolean }> => {
    try {
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'timeout' } }), 2500)
      );
      const { error } = await Promise.race([supabase.from(table).select('id').limit(1), timeoutPromise]) as any;
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('could not find') || msg.includes('does not exist') || msg.includes('schema cache')) {
          return { table, exists: false };
        }
      }
      return { table, exists: true };
    } catch {
      return { table, exists: false };
    }
  };

  const allTables = [...REQUIRED_TABLES, ...OPTIONAL_TABLES];
  const results = await Promise.all(allTables.map(checkTable));

  const optionalMissing: string[] = [];
  for (const r of results) {
    const isRequired = (REQUIRED_TABLES as readonly string[]).includes(r.table);
    if (r.exists) {
      found.push(r.table);
    } else if (isRequired) {
      missing.push(r.table);
    } else {
      optionalMissing.push(r.table);
    }
  }

  if (missing.length > 0) {
    return { status: 'fail', message: `Missing required tables: ${missing.join(', ')}. Found: ${found.join(', ')}` };
  }
  if (optionalMissing.length > 0) {
    return { status: 'warn', message: `All required tables OK. Optional missing: ${optionalMissing.join(', ')}` };
  }
  return { status: 'pass', message: `All ${found.length} required + ${OPTIONAL_TABLES.length} optional tables verified` };
}

async function checkAuthService(): Promise<CheckStatus> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { status: 'warn', message: `Auth error: ${error.message}` };
    }
    if (data.session) {
      return { status: 'pass', message: 'Authenticated session active' };
    }
    return { status: 'pass', message: 'Auth service reachable (no active session)' };
  } catch (err) {
    return { status: 'fail', message: `Auth unreachable: ${(err as Error)?.message}` };
  }
}

async function checkStorageIntegrity(): Promise<CheckStatus> {
  try {
    const result = await runStorageIntegrityCheck();
    if (result.passed) {
      return { status: 'pass', message: `Storage OK — project: ${result.projectId}` };
    }
    return { status: 'warn', message: `Issues: ${result.issues.join('; ')}` };
  } catch (err) {
    return { status: 'fail', message: `Check failed: ${(err as Error)?.message}` };
  }
}

async function checkRealtimeChannel(): Promise<CheckStatus> {
  try {
    const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
    if (!url) {
      return { status: 'warn', message: 'Supabase URL not configured — realtime disabled' };
    }
    return { status: 'pass', message: 'Realtime configuration present' };
  } catch (err) {
    return { status: 'warn', message: `Realtime check: ${(err as Error)?.message}` };
  }
}

export async function runStartupHealthCheck(): Promise<HealthCheckResult> {
  console.log('[HealthCheck] Starting comprehensive health check...');
  const start = Date.now();

  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  if (!url || !key) {
    console.log('[HealthCheck] Supabase not configured — skipping remote checks');
    let storageCheck: CheckStatus = { status: 'pass', message: 'Storage OK' };
    try {
      storageCheck = await checkStorageIntegrity();
    } catch (err) {
      storageCheck = { status: 'warn', message: `Storage check error: ${(err as Error)?.message}` };
    }
    return {
      overall: 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        supabaseConnection: { status: 'warn', message: 'Supabase not configured — using local storage fallback' },
        supabaseTables: { status: 'warn', message: 'Cannot check — no connection' },
        storageIntegrity: storageCheck,
        authService: { status: 'warn', message: 'No Supabase config — auth unavailable' },
        realtimeChannel: { status: 'warn', message: 'No Supabase config — realtime disabled' },
      },
      warnings: ['Supabase environment variables not configured — using local storage fallback'],
      errors: [],
    };
  }

  const [connCheck, tablesCheck, authCheck, storageCheck, realtimeCheck] = await Promise.all([
    checkSupabaseConnection(),
    checkSupabaseTables(),
    checkAuthService(),
    checkStorageIntegrity(),
    checkRealtimeChannel(),
  ]);

  const checks = {
    supabaseConnection: connCheck,
    supabaseTables: tablesCheck,
    storageIntegrity: storageCheck,
    authService: authCheck,
    realtimeChannel: realtimeCheck,
  };

  const warnings: string[] = [];
  const errors: string[] = [];

  Object.entries(checks).forEach(([name, check]) => {
    if (check.status === 'warn') warnings.push(`${name}: ${check.message}`);
    if (check.status === 'fail') errors.push(`${name}: ${check.message}`);
  });

  const failCount = Object.values(checks).filter(c => c.status === 'fail').length;
  const warnCount = Object.values(checks).filter(c => c.status === 'warn').length;

  let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (failCount >= 2) overall = 'critical';
  else if (failCount >= 1 || warnCount >= 2) overall = 'degraded';

  const duration = Date.now() - start;

  console.log(`[HealthCheck] Complete in ${duration}ms — ${overall.toUpperCase()}`);
  console.log(`[HealthCheck] Supabase: ${connCheck.status} (${connCheck.latencyMs ?? '?'}ms)`);
  console.log(`[HealthCheck] Tables: ${tablesCheck.status} — ${tablesCheck.message}`);
  console.log(`[HealthCheck] Auth: ${authCheck.status}`);
  console.log(`[HealthCheck] Storage: ${storageCheck.status}`);
  console.log(`[HealthCheck] Realtime: ${realtimeCheck.status}`);
  if (warnings.length > 0) console.log('[HealthCheck] Warnings:', warnings);
  if (errors.length > 0) console.log('[HealthCheck] Issues:', errors);

  return {
    overall,
    timestamp: new Date().toISOString(),
    checks,
    warnings,
    errors,
  };
}
