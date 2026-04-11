import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

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

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      console.log('[Supabase] SecureStore getItem error for key:', key);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      console.log('[Supabase] SecureStore setItem error for key:', key);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      console.log('[Supabase] SecureStore removeItem error for key:', key);
    }
  },
};

let _client: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
  _client = createClient(effectiveUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
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
        ...(isSelfHosted ? {} : { 'x-connection-pool': 'true' }),
        'x-client-info': `ivx-app/${Platform.OS}`,
      },
      fetch: (url: RequestInfo | URL, options?: RequestInit) => {
        const urlStr = requestUrlString(url);
        const nextOptions = stripConnectionPoolHeaderForAuth(urlStr, options);
        logAuthTokenRequestIfDev(urlStr, nextOptions);
        const controller = new AbortController();
        const timeoutMs = isSelfHosted ? 20000 : 15000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, {
          ...nextOptions,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
      },
    },
    realtime: {
      params: {
        eventsPerSecond: isSelfHosted ? 5 : 2,
      },
      heartbeatIntervalMs: isSelfHosted ? 30000 : 45000,
      reconnectAfterMs: (tries: number) => {
        const baseDelay = Math.min(3000 * Math.pow(2, tries), 60000);
        const jitter = Math.random() * 2000;
        return baseDelay + jitter;
      },
    },
  });
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
} else {
  console.warn('[Supabase]', SUPABASE_NOT_CONFIGURED_MESSAGE);
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
  return !!_client;
}

export function isSelfHostedSupabase(): boolean {
  return isSelfHosted;
}

export const supabase: SupabaseClient = _client ?? _noopClient;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
}
