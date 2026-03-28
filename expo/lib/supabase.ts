import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

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
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
      heartbeatIntervalMs: 5000,
      reconnectAfterMs: (tries: number) => Math.min(1000 * Math.pow(1.5, tries), 5000),
    },
  });
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

export const supabase: SupabaseClient = _client ?? _noopClient;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
}
