const _supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');

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
  const custom = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (custom) return custom;

  if (_supabaseUrl) {
    return `${_supabaseUrl}/functions/v1`;
  }

  console.warn('[API] No API base URL configured');
  return '';
}

export function getSupabaseUrl(): string {
  return _supabaseUrl;
}

export function isApiConfigured(): boolean {
  return !!_supabaseUrl;
}

export function getAuthHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}
