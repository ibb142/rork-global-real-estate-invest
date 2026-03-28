import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[SupabaseAdmin] Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Supabase service_role key not configured. Add SUPABASE_SERVICE_ROLE_KEY to environment variables.');
  }

  _adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('[SupabaseAdmin] Admin client created with service_role key');
  return _adminClient;
}

export function isServiceRoleConfigured(): boolean {
  return !!(supabaseUrl && serviceRoleKey && serviceRoleKey.startsWith('eyJ'));
}
