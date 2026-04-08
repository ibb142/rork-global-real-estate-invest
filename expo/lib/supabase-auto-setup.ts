import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_SETUP_KEY = 'ivx_auto_setup_last_run';
const SETUP_COOLDOWN_MS = 60 * 60 * 1000;
const SETUP_TIMEOUT_MS = 8000;

const REQUIRED_TABLES = [
  'profiles', 'wallets', 'properties', 'market_data', 'holdings',
  'transactions', 'notifications', 'analytics_events', 'image_registry',
  'push_tokens', 'jv_deals', 'landing_analytics', 'waitlist',
  'visitor_sessions', 'realtime_snapshots', 'messages',
];

const REQUIRED_FUNCTIONS = [
  'is_admin', 'is_owner_of', 'get_user_role', 'verify_admin_access',
  'ensure_deal_photos_bucket', 'increment_sms_counter',
  'upsert_visitor_session', 'mark_inactive_sessions', 'save_realtime_snapshot',
];

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
  return (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
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
  if (!apiBase) return null;

  try {
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return null;

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
    if (msg.includes('abort')) {
      console.log('[AutoSetup] Backend auto-deploy timed out');
    } else {
      console.log('[AutoSetup] Backend auto-deploy error:', msg);
    }
    return null;
  }
}

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
    console.warn('[AutoSetup] Missing tables:', missing.join(', '));
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

export async function runAutoSetup(options?: { force?: boolean }): Promise<SetupStatus> {
  if (_setupInProgress) {
    console.log('[AutoSetup] Setup already in progress — skipping');
    return { ran: false, result: null, skipped: true, reason: 'in_progress' };
  }

  if (!isSupabaseConfigured()) {
    console.log('[AutoSetup] Supabase not configured — skipping');
    return { ran: false, result: null, skipped: true, reason: 'not_configured' };
  }

  const shouldRun = await shouldRunSetup(options?.force);
  if (!shouldRun) {
    console.log('[AutoSetup] Setup recently ran — skipping (cooldown)');
    return { ran: false, result: _lastSetupResult, skipped: true, reason: 'cooldown' };
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

    console.log('[AutoSetup] Falling back to table verification...');
    const verifyResult = await verifyTablesExist();
    _lastSetupResult = verifyResult;
    await saveSetupResult(verifyResult);
    _setupInProgress = false;
    return { ran: true, result: verifyResult, skipped: false, reason: 'verify_only' };
  } catch (err) {
    console.log('[AutoSetup] Exception:', (err as Error)?.message);
    _setupInProgress = false;
    return { ran: true, result: null, skipped: false, reason: 'exception: ' + (err as Error)?.message };
  }
}

export function getLastSetupResult(): AutoSetupResult | null {
  return _lastSetupResult;
}

export function getRequiredTables(): string[] {
  return [...REQUIRED_TABLES];
}

export function getRequiredFunctions(): string[] {
  return [...REQUIRED_FUNCTIONS];
}

export async function forceAutoSetup(): Promise<SetupStatus> {
  return runAutoSetup({ force: true });
}
