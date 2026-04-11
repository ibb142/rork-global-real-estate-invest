import { runWithAbortTimeout, isAbortLikeError, toErrorMessage } from '@/lib/abort-utils';
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

export interface RunStartupHealthCheckOptions {
  force?: boolean;
}

interface CheckStatus {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  latencyMs?: number;
}

interface StartupHealthCacheEntry {
  result: HealthCheckResult;
  timestamp: number;
}

const REQUIRED_TABLES = ['profiles', 'wallets', 'transactions', 'holdings', 'notifications'] as const;
const OPTIONAL_TABLES = ['jv_deals', 'audit_trail', 'waitlist'] as const;
const STARTUP_HEALTH_CACHE_MS = 120_000;
const STARTUP_HEALTH_TIMEOUT_MS = 3_000;

let cachedStartupHealthResult: StartupHealthCacheEntry | null = null;
let inFlightStartupHealthCheck: Promise<HealthCheckResult> | null = null;

function getCachedStartupHealthResult(): HealthCheckResult | null {
  if (!cachedStartupHealthResult) {
    return null;
  }

  const ageMs = Date.now() - cachedStartupHealthResult.timestamp;
  if (ageMs > STARTUP_HEALTH_CACHE_MS) {
    cachedStartupHealthResult = null;
    return null;
  }

  console.log('[HealthCheck] Returning cached startup snapshot from', ageMs, 'ms ago');
  return cachedStartupHealthResult.result;
}

function setCachedStartupHealthResult(result: HealthCheckResult): void {
  cachedStartupHealthResult = {
    result,
    timestamp: Date.now(),
  };
}

async function checkSupabaseConnection(): Promise<CheckStatus> {
  const start = Date.now();

  try {
    const { error } = await runWithAbortTimeout(
      STARTUP_HEALTH_TIMEOUT_MS,
      (signal) => supabase.from('profiles').select('id').limit(1).abortSignal(signal),
      'Connection check timeout 3s',
    );
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
    const latency = Date.now() - start;
    const message = toErrorMessage(err);

    if (isAbortLikeError(err)) {
      return { status: 'warn', message, latencyMs: latency };
    }

    return { status: 'fail', message: `Connection failed: ${message}`, latencyMs: latency };
  }
}

async function checkSupabaseTables(): Promise<CheckStatus> {
  const missing: string[] = [];
  const found: string[] = [];
  const timedOut: string[] = [];

  const checkTable = async (table: string): Promise<{ table: string; exists: boolean; timedOut: boolean }> => {
    try {
      const { error } = await runWithAbortTimeout(
        2_500,
        (signal) => supabase.from(table).select('id').limit(1).abortSignal(signal),
        `Table check timeout for ${table}`,
      );

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('could not find') || msg.includes('does not exist') || msg.includes('schema cache')) {
          return { table, exists: false, timedOut: false };
        }
      }

      return { table, exists: true, timedOut: false };
    } catch (err) {
      if (isAbortLikeError(err)) {
        return { table, exists: false, timedOut: true };
      }

      return { table, exists: false, timedOut: false };
    }
  };

  const allTables = [...REQUIRED_TABLES, ...OPTIONAL_TABLES];
  const results = await Promise.all(allTables.map(checkTable));

  const optionalMissing: string[] = [];
  for (const result of results) {
    if (result.timedOut) {
      timedOut.push(result.table);
      continue;
    }

    const isRequired = (REQUIRED_TABLES as readonly string[]).includes(result.table);
    if (result.exists) {
      found.push(result.table);
    } else if (isRequired) {
      missing.push(result.table);
    } else {
      optionalMissing.push(result.table);
    }
  }

  if (missing.length > 0) {
    return { status: 'fail', message: `Missing required tables: ${missing.join(', ')}. Found: ${found.join(', ')}` };
  }

  if (timedOut.length > 0) {
    return { status: 'warn', message: `Table verification timed out for: ${timedOut.join(', ')}` };
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
    return { status: 'fail', message: `Auth unreachable: ${toErrorMessage(err)}` };
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
    return { status: 'fail', message: `Check failed: ${toErrorMessage(err)}` };
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
    return { status: 'warn', message: `Realtime check: ${toErrorMessage(err)}` };
  }
}

export async function runStartupHealthCheck(options: RunStartupHealthCheckOptions = {}): Promise<HealthCheckResult> {
  const force = options.force ?? false;

  if (inFlightStartupHealthCheck) {
    console.log('[HealthCheck] Joining in-flight startup health check');
    return inFlightStartupHealthCheck;
  }

  if (!force) {
    const cachedResult = getCachedStartupHealthResult();
    if (cachedResult) {
      return cachedResult;
    }
  }

  inFlightStartupHealthCheck = (async (): Promise<HealthCheckResult> => {
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
        storageCheck = { status: 'warn', message: `Storage check error: ${toErrorMessage(err)}` };
      }

      const result: HealthCheckResult = {
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

      setCachedStartupHealthResult(result);
      return result;
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

    const result: HealthCheckResult = {
      overall,
      timestamp: new Date().toISOString(),
      checks,
      warnings,
      errors,
    };

    setCachedStartupHealthResult(result);
    return result;
  })();

  return inFlightStartupHealthCheck.finally(() => {
    inFlightStartupHealthCheck = null;
  });
}
