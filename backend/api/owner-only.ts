import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { IVXOwnerRole } from '../../expo/shared/ivx';

type IVXOwnerProfileRow = {
  id: string;
  email: string | null;
  role: string | null;
};

export type IVXOwnerRequestContext = {
  client: SupabaseClient;
  userId: string;
  email: string | null;
  role: IVXOwnerRole;
  accessToken: string;
};

const OWNER_ONLY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIVXRole(value: string | null | undefined): IVXOwnerRole | 'investor' {
  const normalizedValue = readTrimmedString(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

  if (normalizedValue === 'owner' || normalizedValue === 'owneradmin') {
    return 'owner';
  }

  return 'investor';
}

function createIVXServerClient(): SupabaseClient {
  const supabaseUrl = readTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = readTrimmedString(process.env.SUPABASE_SERVICE_ROLE_KEY);

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

function extractBearerToken(request: Request): string | null {
  const authorizationHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') {
    return null;
  }

  const trimmedToken = readTrimmedString(token);
  return trimmedToken.length > 0 ? trimmedToken : null;
}

async function loadOwnerProfile(client: SupabaseClient, userId: string): Promise<IVXOwnerProfileRow | null> {
  const profileResult = await client.from('profiles').select('id, email, role').eq('id', userId).maybeSingle();

  if (profileResult.error) {
    console.log('[IVXOwnerOnly] Profile lookup failed:', profileResult.error.message);
    return null;
  }

  return profileResult.data as IVXOwnerProfileRow | null;
}

export function ownerOnlyJson(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: OWNER_ONLY_HEADERS,
  });
}

export function ownerOnlyOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: OWNER_ONLY_HEADERS,
  });
}

export async function assertIVXOwnerOnly(request: Request): Promise<IVXOwnerRequestContext> {
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    throw new Error('Owner authorization is required.');
  }

  const client = createIVXServerClient();
  const userResult = await client.auth.getUser(accessToken);

  if (userResult.error || !userResult.data.user) {
    console.log('[IVXOwnerOnly] Supabase user verification failed:', userResult.error?.message ?? 'missing user');
    throw new Error('Invalid owner session.');
  }

  const user = userResult.data.user;
  const ownerProfile = await loadOwnerProfile(client, user.id);
  const normalizedRole = normalizeIVXRole(ownerProfile?.role ?? null);

  if (normalizedRole !== 'owner') {
    console.log('[IVXOwnerOnly] Blocked non-owner request:', {
      userId: user.id,
      email: user.email ?? null,
      profileRole: ownerProfile?.role ?? null,
      normalizedRole,
    });
    throw new Error('Owner access is required for IVX Owner AI.');
  }

  return {
    client,
    userId: user.id,
    email: ownerProfile?.email ?? user.email ?? null,
    role: 'owner',
    accessToken,
  };
}
