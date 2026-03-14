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
      heartbeatIntervalMs: 15000,
      reconnectAfterMs: (tries: number) => Math.min(1000 * Math.pow(1.5, tries), 15000),
    },
  });
} else {
  console.warn('[Supabase]', SUPABASE_NOT_CONFIGURED_MESSAGE);
}

export const supabase = _client ?? (new Proxy({} as SupabaseClient, {
  get(_, _prop) {
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  },
}) as SupabaseClient);

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
}
