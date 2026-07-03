import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Production Supabase fallback for project kvclcdjmjghndxsngfzb.
 *
 * The anon key is a PUBLIC key designed to be embedded in client apps.
 * It is protected by Row Level Security (RLS) policies on the database,
 * not by secrecy. This is the standard Supabase client pattern.
 *
 * These constants ensure the Supabase client always initializes in
 * production builds even when EXPO_PUBLIC_SUPABASE_URL / ANON_KEY are
 * not injected as environment variables at build time.
 */
const PRODUCTION_SUPABASE_URL = 'https://kvclcdjmjghndxsngfzb.supabase.co';
const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk';

const envUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const envKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const supabaseUrl = envUrl || PRODUCTION_SUPABASE_URL;
const supabaseAnonKey = envKey || PRODUCTION_SUPABASE_ANON_KEY;

function isHostedSupabase(url: string): boolean {
  try {
    return new URL(url).hostname.includes('.supabase.co');
  } catch {
    return false;
  }
}

function getEffectiveUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('.supabase.co')) {
      console.log('[Supabase] Self-hosted instance detected:', parsed.hostname);
    } else {
      console.log('[Supabase] Hosted instance:', parsed.hostname);
    }
  } catch {}
  return url;
}

const effectiveUrl = getEffectiveUrl(supabaseUrl);
const isSelfHosted = !isHostedSupabase(supabaseUrl);

function requestUrlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') {
    return url;
  }
  if (url instanceof URL) {
    return url.href;
  }
  return url.url;
}

/** Pooling hint is for Postgres/REST; keep it off Auth (GoTrue) requests to avoid edge cases on hosted projects. */
function stripConnectionPoolHeaderForAuth(urlStr: string, init: RequestInit | undefined): RequestInit {
  if (!init) {
    return {};
  }
  if (isSelfHosted || !urlStr.includes('/auth/v1/') || !init.headers) {
    return { ...init };
  }
  const headers = new Headers(init.headers);
  headers.delete('x-connection-pool');
  return { ...init, headers };
}

function logAuthTokenRequestIfDev(urlStr: string, init: RequestInit | undefined): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }
  if (!urlStr.includes('/auth/v1/token')) {
    return;
  }
  const body = init?.body;
  if (typeof body !== 'string') {
    return;
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const safe: Record<string, unknown> = { ...parsed };
    if (typeof safe.password === 'string') {
      safe.password = `[REDACTED length=${safe.password.length}]`;
    }
    console.log('[Supabase] /auth/v1/token outbound JSON:', JSON.stringify(safe));
  } catch {
    console.log('[Supabase] /auth/v1/token outbound body (non-JSON, not logged)');
  }
}

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  'Supabase URL is required. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment variables. Restart the dev server after changing env.';

/** True when the URL/key came from the production fallback constants. */
export const SUPABASE_USING_PRODUCTION_FALLBACK = !envUrl && !envKey;

/** Source of the Supabase config for diagnostics. */
export const SUPABASE_CONFIG_SOURCE: 'env' | 'fallback' = SUPABASE_USING_PRODUCTION_FALLBACK ? 'fallback' : 'env';

/**
 * Supabase session storage adapter.
 *
 * IMPORTANT: We use AsyncStorage (not SecureStore) because Supabase session
 * payloads (access_token + refresh_token + user JSON) routinely exceed 2KB,
 * which is above expo-secure-store's per-value limit on Android. When the
 * limit is hit, setItemAsync fails silently and the session is never persisted
 * — causing the user to be logged out every time the app is closed.
 *
 * AsyncStorage is the storage layer recommended by the official Supabase
 * Expo/React Native guide and supports payloads of any practical size.
 *
 * On web, AsyncStorage transparently uses localStorage. SecureStore is no-op
 * on web, so this adapter also fixes web persistence in Expo web builds.
 *
 * Migration: on first read, if the new AsyncStorage slot is empty but a
 * legacy SecureStore value exists for the same key, we copy it over so
 * users who were authenticated under the old setup remain logged in.
 */
async function migrateLegacySecureStoreValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const legacy = await SecureStore.getItemAsync(key);
    if (!legacy) return null;
    await AsyncStorage.setItem(key, legacy);
    try { await SecureStore.deleteItemAsync(key); } catch {}
    console.log('[Supabase] Migrated legacy SecureStore session to AsyncStorage for key:', key);
    return legacy;
  } catch {
    return null;
  }
}

const AsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) return value;
      return await migrateLegacySecureStoreValue(key);
    } catch (error) {
      console.log('[Supabase] AsyncStorage getItem error for key:', key, (error as Error)?.message ?? 'unknown');
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.log('[Supabase] AsyncStorage setItem error for key:', key, (error as Error)?.message ?? 'unknown');
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.log('[Supabase] AsyncStorage removeItem error for key:', key, (error as Error)?.message ?? 'unknown');
    }
    if (Platform.OS !== 'web') {
      try { await SecureStore.deleteItemAsync(key); } catch {}
    }
  },
};

let _client: SupabaseClient | null = null;
let _clientInitAttempted = false;
let _clientInitError: string | null = null;

function buildSupabaseClient(url: string, key: string): SupabaseClient {
  const selfHosted = !isHostedSupabase(url);
  const effective = getEffectiveUrl(url);

  return createClient(effective, key, {
    auth: {
      storage: AsyncStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        ...(selfHosted ? {} : { 'x-connection-pool': 'true' }),
        'x-client-info': `ivx-app/${Platform.OS}`,
      },
      fetch: ((url: RequestInfo | URL, options?: RequestInit) => {
        const urlStr = requestUrlString(url);
        const nextOptions = stripConnectionPoolHeaderForAuth(urlStr, options);
        logAuthTokenRequestIfDev(urlStr, nextOptions);
        const controller = new AbortController();
        const timeoutMs = selfHosted ? 20000 : 15000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, {
          ...nextOptions,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
      }) as typeof fetch,
    },
    realtime: {
      params: {
        eventsPerSecond: selfHosted ? 5 : 2,
      },
      heartbeatIntervalMs: selfHosted ? 30000 : 45000,
      reconnectAfterMs: (tries: number) => {
        const baseDelay = Math.min(3000 * Math.pow(2, tries), 60000);
        const jitter = Math.random() * 2000;
        return baseDelay + jitter;
      },
    },
  });
}

function initializeClient(): void {
  // Allow retry when _client is still null. This is critical for stale Expo
  // Go bundles where the first init ran before production fallback constants
  // were available, leaving _client null. Only skip if we already have a
  // working client.
  if (_client) return;
  _clientInitAttempted = true;
  _clientInitError = null;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      _client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
      console.log(`[Supabase] Client initialized (${isSelfHosted ? 'self-hosted' : 'hosted+pooler'}), ${isSelfHosted ? 5 : 2} events/sec`);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        try {
          const host = new URL(effectiveUrl).hostname;
          const key = supabaseAnonKey;
          const keyHint = key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : '(short key)';
          console.log('[Supabase] Config check (preview/dev): host=', host, 'anonKeyHint=', keyHint);
        } catch {
          console.log('[Supabase] Config check: URL parse failed for logging');
        }
      }
    } catch (error) {
      _clientInitError = (error as Error)?.message ?? 'unknown initialization error';
      console.warn('[Supabase] Client initialization failed:', _clientInitError);
    }
  } else {
    _clientInitError = SUPABASE_NOT_CONFIGURED_MESSAGE;
    console.warn('[Supabase]', SUPABASE_NOT_CONFIGURED_MESSAGE);
  }
}

initializeClient();

/** Re-initialize the Supabase client at runtime if it is not already configured.
 * This is a safety net for stale Expo Go bundles where the module-level init
 * may have failed or run with missing env vars before the fix was loaded. */
export function ensureSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  // Reset the init flag so initializeClient() will retry. In stale Expo Go
  // bundles, the first init may have failed before production fallback
  // constants were loaded, leaving _client null and _clientInitAttempted true.
  _clientInitAttempted = false;
  _clientInitError = null;
  initializeClient();
  if (_client) return _client;
  throw new Error(_clientInitError || SUPABASE_NOT_CONFIGURED_MESSAGE);
}

const _noopAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  signInWithPassword: async () => ({ data: { session: null, user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  signUp: async () => ({ data: { session: null, user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  signOut: async () => ({ error: null }),
  onAuthStateChange: (_event: string, _session: unknown) => ({ data: { subscription: { unsubscribe: () => {} } } }),
  refreshSession: async () => ({ data: { session: null, user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  updateUser: async () => ({ data: { user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  resetPasswordForEmail: async () => ({ data: {}, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  setSession: async () => ({ data: { session: null, user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  reauthenticate: async () => ({ data: { user: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  mfa: {
    listFactors: async () => ({ data: { all: [], totp: [], phone: [] }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: null, nextLevel: null }, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
    enroll: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
    challenge: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
    verify: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
    unenroll: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, name: 'AuthError', status: 500 } }),
  },
};

const _noopQuery = {
  select: function(..._args: unknown[]) { return this; },
  insert: function(..._args: unknown[]) { return this; },
  update: function(..._args: unknown[]) { return this; },
  upsert: function(..._args: unknown[]) { return this; },
  delete: function(..._args: unknown[]) { return this; },
  eq: function(..._args: unknown[]) { return this; },
  neq: function(..._args: unknown[]) { return this; },
  gte: function(..._args: unknown[]) { return this; },
  lte: function(..._args: unknown[]) { return this; },
  order: function(..._args: unknown[]) { return this; },
  limit: function(..._args: unknown[]) { return this; },
  range: function(..._args: unknown[]) { return this; },
  single: function(..._args: unknown[]) { return this; },
  then: function(resolve: (v: unknown) => void) {
    resolve({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, code: 'NOT_CONFIGURED' }, count: null });
  },
};

const _noopStorageBucket = {
  upload: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, statusCode: '500' } }),
  download: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, statusCode: '500' } }),
  list: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, statusCode: '500' } }),
  remove: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, statusCode: '500' } }),
  getPublicUrl: () => ({ data: { publicUrl: '' } }),
  createSignedUrl: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE, statusCode: '500' } }),
};

const _noopStorage = {
  from: (_bucket: string) => ({ ..._noopStorageBucket }),
  listBuckets: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
  createBucket: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
  getBucket: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
  updateBucket: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
  deleteBucket: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
  emptyBucket: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
};

const _noopClient = {
  auth: _noopAuth,
  from: (_table: string) => ({ ..._noopQuery }),
  storage: _noopStorage,
  channel: (_name: string) => ({
    on: function(..._args: unknown[]) { return this; },
    subscribe: function(cb?: (status: string) => void) {
      if (cb) {
        setTimeout(() => cb('CLOSED'), 50);
      }
      return this;
    },
    unsubscribe: async () => {},
  }),
  removeChannel: async () => ({ error: null }),
  rpc: async () => ({ data: null, error: { message: SUPABASE_NOT_CONFIGURED_MESSAGE } }),
} as unknown as SupabaseClient;

export function isSupabaseConfigured(): boolean {
  if (_client) return true;
  initializeClient();
  return !!_client;
}

export function isSelfHostedSupabase(): boolean {
  return isSelfHosted;
}

export function getSupabaseConfigAudit(): {
  urlConfigured: boolean;
  keyConfigured: boolean;
  usingFallback: boolean;
  host: string;
  initError: string | null;
} {
  return {
    urlConfigured: !!supabaseUrl,
    keyConfigured: !!supabaseAnonKey,
    usingFallback: SUPABASE_USING_PRODUCTION_FALLBACK,
    host: (() => {
      try { return new URL(effectiveUrl).hostname; } catch { return 'unknown'; }
    })(),
    initError: _clientInitError,
  };
}

/**
 * Live Supabase client that always delegates to the current _client.
 *
 * This fixes the root cause of "Supabase URL is required" in stale Expo Go
 * bundles. The old `const supabase = _client ?? _noopClient` was a snapshot
 * taken at module load time — if _client was null when the module first
 * loaded, supabase was permanently bound to _noopClient. Even after
 * ensureSupabaseClient() created a real client, the export never updated.
 *
 * The Proxy lazily delegates every property access to the current _client,
 * so once ensureSupabaseClient() (or initializeClient()) sets _client, all
 * existing references to `supabase` automatically use the real client.
 */
export const supabase: SupabaseClient = new Proxy(_noopClient, {
  get(_target, prop) {
    const target = _client ?? _noopClient;
    const value = Reflect.get(target, prop);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as SupabaseClient;

export function getSupabaseClient(): SupabaseClient {
  return ensureSupabaseClient();
}
