import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQL_SCRIPTS, SCRIPTS_VERSION } from '@/mocks/supabase-scripts';

const AUTO_SETUP_KEY = 'ivx_auto_setup_last_run';
const AUTO_DEPLOY_VERSION_KEY = 'ivx_sql_deployed_version';
const SETUP_COOLDOWN_MS = 60 * 60 * 1000;
const SETUP_TIMEOUT_MS = 8000;
const DEPLOY_TIMEOUT_MS = 30000;

function isProductionEnvironment(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  return url.includes('.supabase.co') && !url.includes('localhost') && !__DEV__;
}

interface AutoSetupResult {
  success: boolean;
  created: string[];
  existing: string[];
  errors: string[];
  total_tables: number;
  created_count: number;
  existing_count: number;
  timestamp: string;
  error?: string;
}

interface SetupStatus {
  ran: boolean;
  result: AutoSetupResult | null;
  skipped: boolean;
  reason?: string;
}

let _lastSetupResult: AutoSetupResult | null = null;
let _setupInProgress = false;

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
}

async function shouldRunSetup(force?: boolean): Promise<boolean> {
  if (force) return true;
  try {
    const lastRun = await AsyncStorage.getItem(AUTO_SETUP_KEY);
    if (!lastRun) return true;
    const parsed = JSON.parse(lastRun);
    const elapsed = Date.now() - (parsed.timestamp || 0);
    if (elapsed < SETUP_COOLDOWN_MS && parsed.success) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function saveSetupResult(result: AutoSetupResult): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTO_SETUP_KEY, JSON.stringify({
      timestamp: Date.now(),
      success: result.success,
      created_count: result.created_count,
      existing_count: result.existing_count,
      total_tables: result.total_tables,
    }));
  } catch (err) {
    console.log('[AutoSetup] Failed to save setup result:', (err as Error)?.message);
  }
}

async function tryBackendAutoDeploy(): Promise<AutoSetupResult | null> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    console.log('[AutoSetup] No API base URL — skipping backend auto-deploy');
    return null;
  }

  try {
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) {
      console.log('[AutoSetup] No auth token — skipping backend auto-deploy');
      return null;
    }

    console.log('[AutoSetup] Calling backend /auto-deploy-tables...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETUP_TIMEOUT_MS);

    const response = await fetch(`${apiBase}/auto-deploy-tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    console.log('[AutoSetup] Backend response:', response.status, JSON.stringify(data).substring(0, 300));

    if (data.success && data.missing === 0) {
      return {
        success: true,
        created: [],
        existing: [],
        errors: [],
        total_tables: data.existing || 54,
        created_count: 0,
        existing_count: data.existing || 54,
        timestamp: new Date().toISOString(),
      };
    }

    if (data.tables_missing && data.tables_missing.length > 0) {
      console.log('[AutoSetup] Backend reports missing tables:', data.tables_missing.join(', '));
      return {
        success: false,
        created: [],
        existing: [],
        errors: data.tables_missing.map((t: string) => `Table '${t}' not found`),
        total_tables: (data.existing || 0) + (data.missing || 0),
        created_count: 0,
        existing_count: data.existing || 0,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  } catch (err) {
    const msg = (err as Error)?.message || '';
    if (msg.includes('aborted') || msg.includes('abort')) {
      console.log('[AutoSetup] Backend auto-deploy timed out');
    } else {
      console.log('[AutoSetup] Backend auto-deploy error:', msg);
    }
    return null;
  }
}

export async function runAutoSetup(options?: { force?: boolean }): Promise<SetupStatus> {
  if (_setupInProgress) {
    console.log('[AutoSetup] Setup already in progress — skipping');
    return { ran: false, result: null, skipped: true, reason: 'in_progress' };
  }

  if (!isSupabaseConfigured()) {
    console.log('[AutoSetup] Supabase not configured — skipping auto-setup');
    return { ran: false, result: null, skipped: true, reason: 'not_configured' };
  }

  const shouldRun = await shouldRunSetup(options?.force);
  if (!shouldRun) {
    console.log('[AutoSetup] Setup recently ran successfully — skipping (cooldown active)');
    return { ran: false, result: _lastSetupResult, skipped: true, reason: 'cooldown' };
  }

  if (isProductionEnvironment()) {
    console.warn('[AutoSetup] Production environment detected — BLOCKING table creation. Only verification allowed.');
    _setupInProgress = true;
    try {
      const verifyResult = await verifyTablesExist();
      _lastSetupResult = verifyResult;
      await saveSetupResult(verifyResult);
      _setupInProgress = false;
      return { ran: true, result: verifyResult, skipped: false, reason: 'production_verify_only' };
    } catch (err) {
      _setupInProgress = false;
      return { ran: true, result: null, skipped: false, reason: 'production_verify_error: ' + (err as Error)?.message };
    }
  }

  _setupInProgress = true;
  console.log('[AutoSetup] Running auto-setup...');

  try {
    const backendResult = await tryBackendAutoDeploy();
    if (backendResult) {
      _lastSetupResult = backendResult;
      await saveSetupResult(backendResult);
      _setupInProgress = false;
      console.log('[AutoSetup] Backend auto-deploy completed. Success:', backendResult.success);
      return { ran: true, result: backendResult, skipped: false, reason: 'backend_deploy' };
    }

    console.log('[AutoSetup] Trying RPC auto_setup_all_tables...');
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Auto-setup timeout after ' + (SETUP_TIMEOUT_MS / 1000) + 's' } }), SETUP_TIMEOUT_MS)
    );

    const rpcPromise = supabase.rpc('auto_setup_all_tables');
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: AutoSetupResult | null; error: { message: string } | null };

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find the function') || (msg.includes('function') && msg.includes('does not exist'))) {
        console.log('[AutoSetup] RPC not found — falling back to table verification');
        const fallbackResult = await verifyTablesExist();
        _lastSetupResult = fallbackResult;
        _setupInProgress = false;
        return { ran: true, result: fallbackResult, skipped: false, reason: 'rpc_not_found_fallback' };
      }
      console.log('[AutoSetup] RPC error:', error.message);
      _setupInProgress = false;
      return { ran: true, result: null, skipped: false, reason: 'rpc_error: ' + error.message };
    }

    if (data) {
      const result = data as AutoSetupResult;
      _lastSetupResult = result;
      await saveSetupResult(result);

      if (result.created_count > 0) {
        console.log('[AutoSetup] CREATED', result.created_count, 'new tables:', result.created.join(', '));
      }
      if (result.existing_count > 0) {
        console.log('[AutoSetup] VERIFIED', result.existing_count, 'existing tables:', result.existing.join(', '));
      }
      if (result.errors && result.errors.length > 0) {
        console.warn('[AutoSetup] Setup warnings:', result.errors.join('; '));
      }
      console.log('[AutoSetup] Total tables:', result.total_tables, '| Created:', result.created_count, '| Existing:', result.existing_count);

      _setupInProgress = false;
      return { ran: true, result, skipped: false };
    }

    console.log('[AutoSetup] RPC returned no data — falling back to verify');
    const verifyResult = await verifyTablesExist();
    _lastSetupResult = verifyResult;
    await saveSetupResult(verifyResult);
    _setupInProgress = false;
    return { ran: true, result: verifyResult, skipped: false, reason: 'no_data_fallback' };
  } catch (err) {
    console.log('[AutoSetup] Exception:', (err as Error)?.message);
    _setupInProgress = false;
    return { ran: true, result: null, skipped: false, reason: 'exception: ' + (err as Error)?.message };
  }
}

const REQUIRED_TABLES = [
  'profiles', 'wallets', 'properties', 'market_data', 'holdings',
  'transactions', 'notifications', 'analytics_events', 'image_registry',
  'push_tokens', 'jv_deals', 'landing_analytics', 'waitlist',
  'visitor_sessions', 'realtime_snapshots',
];

async function verifyTablesExist(): Promise<AutoSetupResult> {
  const existing: string[] = [];
  const missing: string[] = [];

  const checkTable = async (table: string) => {
    try {
      const timeoutP = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'timeout' } }), 3000)
      );
      const { error } = await Promise.race([supabase.from(table).select('*', { count: 'exact', head: true }), timeoutP]) as { error: { message: string } | null };
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('could not find')) {
          missing.push(table);
        } else {
          existing.push(table);
        }
      } else {
        existing.push(table);
      }
    } catch {
      missing.push(table);
    }
  };

  await Promise.all(REQUIRED_TABLES.map(checkTable));

  console.log('[AutoSetup] Verify: existing:', existing.length, '| missing:', missing.length);
  if (missing.length > 0) {
    console.warn('[AutoSetup] Missing tables:', missing.join(', '), '— go to Admin > Supabase SQL to deploy');
  }

  return {
    success: missing.length === 0,
    created: [],
    existing,
    errors: missing.map(t => `Table '${t}' not found`),
    total_tables: existing.length,
    created_count: 0,
    existing_count: existing.length,
    timestamp: new Date().toISOString(),
  };
}

export function getLastSetupResult(): AutoSetupResult | null {
  return _lastSetupResult;
}

export async function forceAutoSetup(): Promise<SetupStatus> {
  return runAutoSetup({ force: true });
}

interface SqlDeployResult {
  deployed: number;
  failed: number;
  skipped: number;
  errors: string[];
  version: string;
}

async function deploySqlViaBackend(sql: string, scriptId: string, scriptName: string, token: string): Promise<boolean> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEPLOY_TIMEOUT_MS);

    const response = await fetch(`${apiBase}/deploy-sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sql, scriptId, scriptName }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    if (data.success) {
      console.log(`[AutoDeploy] Deployed: ${scriptName}`);
      return true;
    }

    if (data.error === 'BOOTSTRAP_REQUIRED') {
      console.log('[AutoDeploy] Bootstrap required — cannot auto-deploy SQL');
      return false;
    }

    console.log(`[AutoDeploy] Failed: ${scriptName} — ${data.error}`);
    return false;
  } catch (err) {
    console.log(`[AutoDeploy] Error deploying ${scriptName}:`, (err as Error)?.message);
    return false;
  }
}

export async function autoDeployOnVersionChange(): Promise<SqlDeployResult | null> {
  try {
    const storedVersion = await AsyncStorage.getItem(AUTO_DEPLOY_VERSION_KEY);
    if (storedVersion === SCRIPTS_VERSION) {
      console.log(`[AutoDeploy] Version ${SCRIPTS_VERSION} already deployed — skipping`);
      return null;
    }

    console.log(`[AutoDeploy] Version change detected: ${storedVersion || 'none'} → ${SCRIPTS_VERSION}`);

    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) {
      console.log('[AutoDeploy] No auth token — skipping auto-deploy');
      return null;
    }

    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      console.log('[AutoDeploy] No API base URL — skipping auto-deploy');
      return null;
    }

    let checkReady = false;
    try {
      const checkResponse = await fetch(`${apiBase}/deploy-sql-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const checkData = await checkResponse.json();
      checkReady = checkData.ready === true;
    } catch {
      console.log('[AutoDeploy] Could not check deploy readiness');
    }

    if (!checkReady) {
      console.log('[AutoDeploy] Bootstrap not ready — skipping auto-deploy. Run Bootstrap script from Admin > Supabase SQL.');
      return null;
    }

    console.log(`[AutoDeploy] Deploying ${SQL_SCRIPTS.length} scripts (version ${SCRIPTS_VERSION})...`);

    let deployed = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const script of SQL_SCRIPTS) {
      if (script.id === 'sql_bootstrap_exec') {
        skipped++;
        continue;
      }

      const success = await deploySqlViaBackend(script.content, script.id, script.title, token);
      if (success) {
        deployed++;
      } else {
        failed++;
        errors.push(`${script.fileName}: deploy failed`);
      }
    }

    const result: SqlDeployResult = {
      deployed,
      failed,
      skipped,
      errors,
      version: SCRIPTS_VERSION,
    };

    if (failed === 0) {
      await AsyncStorage.setItem(AUTO_DEPLOY_VERSION_KEY, SCRIPTS_VERSION);
      console.log(`[AutoDeploy] SUCCESS — ${deployed} scripts deployed, version ${SCRIPTS_VERSION} saved`);
    } else {
      console.log(`[AutoDeploy] PARTIAL — ${deployed} deployed, ${failed} failed. Version NOT saved.`);
    }

    return result;
  } catch (err) {
    console.log('[AutoDeploy] Exception:', (err as Error)?.message);
    return null;
  }
}
