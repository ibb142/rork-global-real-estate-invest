import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    console.error('[SupabaseAdmin] Supabase not configured');
    throw new Error('Supabase not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  console.log('[SupabaseAdmin] Using authenticated client (service_role must be used server-side only)');
  return supabase;
}

export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured();
}
