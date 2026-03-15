import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_SETUP_KEY = 'ivx_auto_setup_last_run';
const SETUP_COOLDOWN_MS = 60 * 60 * 1000;
const SETUP_TIMEOUT_MS = 15000;

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

  _setupInProgress = true;
  console.log('[AutoSetup] Running auto_setup_all_tables RPC...');

  try {
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Auto-setup timeout after ' + (SETUP_TIMEOUT_MS / 1000) + 's' } }), SETUP_TIMEOUT_MS)
    );

    const rpcPromise = supabase.rpc('auto_setup_all_tables');
    const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as { data: AutoSetupResult | null; error: { message: string } | null };

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find the function') || msg.includes('function') && msg.includes('does not exist')) {
        console.log('[AutoSetup] RPC function not found — run supabase-auto-setup-rpc.sql in Supabase SQL Editor first');
        console.log('[AutoSetup] Falling back to table verification...');
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

    console.log('[AutoSetup] RPC returned no data');
    _setupInProgress = false;
    return { ran: true, result: null, skipped: false, reason: 'no_data' };
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
];

async function verifyTablesExist(): Promise<AutoSetupResult> {
  const existing: string[] = [];
  const missing: string[] = [];

  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
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
  }

  console.log('[AutoSetup] Verify: existing:', existing.length, '| missing:', missing.length);
  if (missing.length > 0) {
    console.warn('[AutoSetup] Missing tables:', missing.join(', '), '— run supabase-auto-setup-rpc.sql in Supabase SQL Editor');
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
