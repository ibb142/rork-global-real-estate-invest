const IVX_CANONICAL_API_BASE_URL = 'https://api.ivxholding.com';

/** Production Supabase fallback for project kvclcdjmjghndxsngfzb. */
const PRODUCTION_SUPABASE_URL = 'https://kvclcdjmjghndxsngfzb.supabase.co';

const _supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || PRODUCTION_SUPABASE_URL).trim().replace(/\/$/, '');
const _directApiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || IVX_CANONICAL_API_BASE_URL).trim().replace(/\/$/, '');

export function getDirectApiBaseUrl(): string {
  return _directApiBaseUrl;
}

export function getSupabaseEdgeFunctionUrl(fnName: string): string {
  if (!_supabaseUrl) {
    console.warn('[API] Supabase URL not configured');
    return '';
  }
  return `${_supabaseUrl}/functions/v1/${fnName}`;
}

export function getSupabaseRestUrl(): string {
  if (!_supabaseUrl) {
    console.warn('[API] Supabase URL not configured');
    return '';
  }
  return `${_supabaseUrl}/rest/v1`;
}

export function getApiBaseUrl(): string {
  if (_directApiBaseUrl) {
    return _directApiBaseUrl;
  }

  if (_supabaseUrl) {
    return `${_supabaseUrl}/functions/v1`;
  }

  console.warn('[API] No API base URL configured, falling back to canonical IVX API host');
  return IVX_CANONICAL_API_BASE_URL;
}

export function getSupabaseUrl(): string {
  return _supabaseUrl;
}

export function isApiConfigured(): boolean {
  return !!_directApiBaseUrl || !!_supabaseUrl;
}

/** Production anon key fallback (public key, RLS-protected). */
const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk';

export function getAuthHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || PRODUCTION_SUPABASE_ANON_KEY,
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}
