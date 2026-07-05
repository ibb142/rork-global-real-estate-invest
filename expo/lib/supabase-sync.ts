import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { AppState, AppStateStatus } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isAdminRole, normalizeRole } from '@/lib/auth-helpers';

export interface SyncStatus {
  connected: boolean;
  lastSync: string | null;
  tables: Record<string, TableSyncStatus>;
  realtimeChannels: number;
  errors: string[];
}

export interface TableSyncStatus {
  exists: boolean;
  rowCount: number | null;
  lastChecked: string;
  error?: string;
}

const CORE_TABLES = [
  'profiles',
  'wallets',
  'wallet_transactions',
  'properties',
  'holdings',
  'transactions',
  'notifications',
  'jv_deals',
  'market_data',
  'analytics_events',
  'waitlist',
  'landing_deals',
  'landing_analytics',
  'visitor_sessions',
  'push_tokens',
  'image_registry',
  'realtime_snapshots',
] as const;

const OWNER_TABLES = [
  'audit_log',
  'landing_page_config',
  'team_members',
  'feature_flags',
  'system_health',
] as const;

let _syncStatus: SyncStatus = {
  connected: false,
  lastSync: null,
  tables: {},
  realtimeChannels: 0,
  errors: [],
};

let _realtimeChannels: RealtimeChannel[] = [];
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function getSyncStatus(): SyncStatus {
  return { ..._syncStatus };
}

export async function checkTableExists(table: string): Promise<TableSyncStatus> {
  if (!isSupabaseConfigured()) {
    return { exists: false, rowCount: null, lastChecked: new Date().toISOString(), error: 'Supabase not configured' };
  }

  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('relation')) {
        return { exists: false, rowCount: null, lastChecked: new Date().toISOString(), error: `Table '${table}' not found` };
      }
      return { exists: true, rowCount: null, lastChecked: new Date().toISOString(), error: error.message };
    }

    return { exists: true, rowCount: count ?? 0, lastChecked: new Date().toISOString() };
  } catch (err) {
    return { exists: false, rowCount: null, lastChecked: new Date().toISOString(), error: (err as Error)?.message };
  }
}

export async function auditAllTables(): Promise<Record<string, TableSyncStatus>> {
  if (!isSupabaseConfigured()) {
    console.log('[SupabaseSync] Not configured — skipping audit');
    return {};
  }

  const allTables = [...CORE_TABLES, ...OWNER_TABLES];
  const results: Record<string, TableSyncStatus> = {};

  const checks = await Promise.allSettled(
    allTables.map(async (table) => {
      const status = await checkTableExists(table);
      return { table, status };
    })
  );

  for (const result of checks) {
    if (result.status === 'fulfilled') {
      results[result.value.table] = result.value.status;
    }
  }

  const existing = Object.entries(results).filter(([, s]) => s.exists).length;
  const missing = Object.entries(results).filter(([, s]) => !s.exists).length;
  console.log(`[SupabaseSync] Audit complete: ${existing} tables exist, ${missing} missing`);

  _syncStatus.tables = results;
  _syncStatus.lastSync = new Date().toISOString();

  return results;
}

export async function initializeSync(): Promise<SyncStatus> {
  if (!isSupabaseConfigured()) {
    console.log('[SupabaseSync] Supabase not configured — sync disabled');
    _syncStatus.connected = false;
    _syncStatus.errors = ['Supabase not configured'];
    return _syncStatus;
  }

  console.log('[SupabaseSync] Initializing full sync...');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    _syncStatus.connected = true;
    console.log('[SupabaseSync] Connection verified. Session:', session ? 'active' : 'none (owner IP mode)');
  } catch (err) {
    console.log('[SupabaseSync] Connection check failed:', (err as Error)?.message);
    _syncStatus.connected = false;
    _syncStatus.errors.push('Connection failed: ' + (err as Error)?.message);
  }

  await auditAllTables();

  setupRealtimeSync();
  setupAppStateHandler();
  startHeartbeat();

  console.log('[SupabaseSync] Sync initialized. Status:', JSON.stringify({
    connected: _syncStatus.connected,
    tablesFound: Object.values(_syncStatus.tables).filter(t => t.exists).length,
    channels: _syncStatus.realtimeChannels,
  }));

  return _syncStatus;
}

function setupRealtimeSync() {
  cleanupRealtimeChannels();

  if (!isSupabaseConfigured()) return;

  const tablesToWatch = [
    'profiles',
    'wallets',
    'wallet_transactions',
    'properties',
    'holdings',
    'transactions',
    'notifications',
    'jv_deals',
    'waitlist',
    'landing_deals',
  ];

  for (const table of tablesToWatch) {
    const tableStatus = _syncStatus.tables[table];
    if (tableStatus && !tableStatus.exists) {
      console.log(`[SupabaseSync] Skipping realtime for '${table}' — table not found`);
      continue;
    }

    try {
      const channel = supabase
        .channel(`sync-${table}`)
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table },
          (payload: any) => {
            console.log(`[SupabaseSync] Realtime ${table}:`, payload.eventType, payload.new?.id || '');
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[SupabaseSync] Realtime subscribed: ${table}`);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.log(`[SupabaseSync] Realtime ${table}: ${status}`);
          }
        });

      _realtimeChannels.push(channel);
    } catch (err) {
      console.log(`[SupabaseSync] Failed to subscribe to ${table}:`, (err as Error)?.message);
    }
  }

  _syncStatus.realtimeChannels = _realtimeChannels.length;
  console.log('[SupabaseSync] Realtime channels established:', _realtimeChannels.length);
}

function cleanupRealtimeChannels() {
  for (const ch of _realtimeChannels) {
    try {
      void supabase.removeChannel(ch);
    } catch {}
  }
  _realtimeChannels = [];
  _syncStatus.realtimeChannels = 0;
}

function setupAppStateHandler() {
  if (_appStateSubscription) {
    _appStateSubscription.remove();
  }

  _appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      console.log('[SupabaseSync] App foregrounded — reconnecting realtime');
      setupRealtimeSync();
    } else if (nextState === 'background') {
      console.log('[SupabaseSync] App backgrounded — pausing realtime');
      cleanupRealtimeChannels();
    }
  });
}

function startHeartbeat() {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
  }

  _heartbeatInterval = setInterval(async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      _syncStatus.connected = !error;

      if (error) {
        console.log('[SupabaseSync] Heartbeat failed:', error.message);
      }
    } catch {
      _syncStatus.connected = false;
    }
  }, 60_000);
}

export function teardownSync() {
  cleanupRealtimeChannels();

  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }

  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }

  console.log('[SupabaseSync] Sync torn down');
}

export async function syncUserData(userId: string): Promise<{
  profile: boolean;
  wallet: boolean;
  holdings: boolean;
  notifications: boolean;
}> {
  const results = { profile: false, wallet: false, holdings: false, notifications: false };

  if (!isSupabaseConfigured() || !userId) return results;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
    results.profile = !!profile;
  } catch {
    console.log('[SupabaseSync] Profile sync check failed for:', userId);
  }

  try {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('user_id', userId)
      .single();
    results.wallet = !!wallet;

    if (!wallet) {
      console.log('[SupabaseSync] No wallet found — creating for:', userId);
      const { error } = await supabase
        .from('wallets')
        .insert({
          user_id: userId,
          available: 0,
          pending: 0,
          invested: 0,
          total: 0,
          currency: 'USD',
        });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (!msg.includes('duplicate') && !msg.includes('already exists')) {
          console.log('[SupabaseSync] Wallet creation failed:', error.message);
        }
      } else {
        results.wallet = true;
      }
    }
  } catch {
    console.log('[SupabaseSync] Wallet sync check failed for:', userId);
  }

  try {
    const { count } = await supabase
      .from('holdings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    results.holdings = (count ?? 0) >= 0;
  } catch {
    console.log('[SupabaseSync] Holdings sync check failed');
  }

  try {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    results.notifications = (count ?? 0) >= 0;
  } catch {
    console.log('[SupabaseSync] Notifications sync check failed');
  }

  console.log('[SupabaseSync] User data sync check:', JSON.stringify(results));
  return results;
}

export async function syncOwnerData(): Promise<{
  totalUsers: number;
  totalProperties: number;
  totalDeals: number;
  totalWaitlist: number;
  totalTransactions: number;
}> {
  const stats = {
    totalUsers: 0,
    totalProperties: 0,
    totalDeals: 0,
    totalWaitlist: 0,
    totalTransactions: 0,
  };

  if (!isSupabaseConfigured()) return stats;

  const queries = [
    { key: 'totalUsers' as const, table: 'profiles' },
    { key: 'totalProperties' as const, table: 'properties' },
    { key: 'totalDeals' as const, table: 'jv_deals' },
    { key: 'totalWaitlist' as const, table: 'waitlist' },
    { key: 'totalTransactions' as const, table: 'transactions' },
  ];

  await Promise.allSettled(
    queries.map(async ({ key, table }) => {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true });
        if (!error && count !== null) {
          stats[key] = count;
        }
      } catch {}
    })
  );

  console.log('[SupabaseSync] Owner data stats:', JSON.stringify(stats));
  return stats;
}

export async function ensureOwnerProfile(userId: string, email: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (data) {
      const existingRole = typeof data.role === 'string' ? data.role : null;
      const normalizedExistingRole = normalizeRole(existingRole);
      if (!isAdminRole(normalizedExistingRole)) {
        console.log('[SupabaseSync] Updating non-admin profile role to owner for:', userId, 'currentRole:', existingRole ?? 'missing');
        await supabase
          .from('profiles')
          .update({ role: 'owner', updated_at: new Date().toISOString() })
          .eq('id', userId);
      } else {
        console.log('[SupabaseSync] Preserving verified admin role for:', userId, 'role:', normalizedExistingRole);
      }
      return true;
    }

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email,
        role: 'owner',
        first_name: 'Owner',
        last_name: '',
        kyc_status: 'approved',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.log('[SupabaseSync] Owner profile creation failed:', error.message);
      return false;
    }

    console.log('[SupabaseSync] Owner profile created:', userId);
    return true;
  } catch (err) {
    console.log('[SupabaseSync] ensureOwnerProfile error:', (err as Error)?.message);
    return false;
  }
}

export function getCoreTables(): readonly string[] {
  return CORE_TABLES;
}

export function getOwnerTables(): readonly string[] {
  return OWNER_TABLES;
}
