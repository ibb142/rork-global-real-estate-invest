import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/auth-helpers';
import { getSupabaseClient, supabase } from '@/lib/supabase';
import {
  IVX_OWNER_AI_API_PATH,
  type IVXOwnerAuthContext,
  type IVXOwnerRole,
} from '@/shared/ivx';

const IVX_OWNER_AI_LEGACY_API_PATH = IVX_OWNER_AI_API_PATH.replace(/^\/api/, '');

const IVX_ALLOWED_OWNER_ROLES = new Set<IVXOwnerRole>(['owner']);

function readTrimmedEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getDefaultProjectApiBaseUrl(): string {
  const projectId = readTrimmedEnv('EXPO_PUBLIC_PROJECT_ID');
  if (!projectId) {
    return '';
  }

  return `https://dev-${projectId}.rorktest.dev`;
}

export function getIVXSupabaseClient(): SupabaseClient {
  return getSupabaseClient();
}

function pushUniqueUrl(urls: string[], value: string): void {
  const normalizedValue = value.trim();
  if (!normalizedValue || urls.includes(normalizedValue)) {
    return;
  }

  urls.push(normalizedValue);
}

export function getIVXOwnerAICandidateEndpoints(): string[] {
  const configuredBaseUrl = readTrimmedEnv('EXPO_PUBLIC_RORK_API_BASE_URL').replace(/\/$/, '');
  const projectBaseUrl = getDefaultProjectApiBaseUrl();
  const urls: string[] = [];

  if (configuredBaseUrl.length > 0) {
    pushUniqueUrl(urls, `${configuredBaseUrl}${IVX_OWNER_AI_API_PATH}`);
    pushUniqueUrl(urls, `${configuredBaseUrl}${IVX_OWNER_AI_LEGACY_API_PATH}`);
  }

  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    const webOrigin = window.location.origin.trim().replace(/\/$/, '');
    if (webOrigin.length > 0) {
      pushUniqueUrl(urls, `${webOrigin}${IVX_OWNER_AI_API_PATH}`);
      pushUniqueUrl(urls, `${webOrigin}${IVX_OWNER_AI_LEGACY_API_PATH}`);
    }
  }

  if (projectBaseUrl.length > 0) {
    pushUniqueUrl(urls, `${projectBaseUrl}${IVX_OWNER_AI_API_PATH}`);
    pushUniqueUrl(urls, `${projectBaseUrl}${IVX_OWNER_AI_LEGACY_API_PATH}`);
  }

  return urls;
}

export function getIVXOwnerAIEndpoint(): string {
  return getIVXOwnerAICandidateEndpoints()[0] ?? IVX_OWNER_AI_API_PATH;
}

export async function getIVXAccessToken(): Promise<string | null> {
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token ?? null;
  console.log('[IVXSupabaseClient] Access token resolved:', accessToken ? 'present' : 'missing');
  return accessToken;
}

export async function getIVXOwnerAuthContext(): Promise<IVXOwnerAuthContext> {
  const sessionResult = await supabase.auth.getSession();
  const session = sessionResult.data.session;
  const user = session?.user ?? null;
  const accessToken = session?.access_token ?? null;

  if (!user || !accessToken) {
    console.log('[IVXSupabaseClient] Missing owner session');
    throw new Error('Please sign in to access IVX Owner AI.');
  }

  const profileResult = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const roleSource = profileResult.data && typeof profileResult.data === 'object' && 'role' in profileResult.data
    ? (profileResult.data as { role?: unknown }).role
    : null;
  const normalizedRole = normalizeRole(typeof roleSource === 'string' ? roleSource : null);

  if (!IVX_ALLOWED_OWNER_ROLES.has(normalizedRole as IVXOwnerRole)) {
    console.log('[IVXSupabaseClient] Blocked non-owner session:', {
      userId: user.id,
      email: user.email ?? null,
      profileRole: typeof roleSource === 'string' ? roleSource : null,
      normalizedRole,
      profileError: profileResult.error?.message ?? null,
    });
    throw new Error('Owner access is required for IVX Owner AI.');
  }

  const ownerContext: IVXOwnerAuthContext = {
    userId: user.id,
    email: user.email ?? null,
    role: 'owner',
    accessToken,
  };

  console.log('[IVXSupabaseClient] Owner auth context ready:', {
    userId: ownerContext.userId,
    email: ownerContext.email,
    role: ownerContext.role,
  });

  return ownerContext;
}

export function createIVXServerSupabaseClient(): SupabaseClient {
  const supabaseUrl = readTrimmedEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readTrimmedEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server-side Supabase environment variables are missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
