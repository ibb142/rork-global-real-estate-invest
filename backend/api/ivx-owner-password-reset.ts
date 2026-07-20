import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertIVXRegisteredOwnerBearer } from './owner-only';
// Local email sanitizer to avoid backend build dependency on expo/lib/auth-helpers.
function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type OwnerPasswordResetPayload = {
  newPassword?: unknown;
};

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': 'https://ivxholding.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

function json(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: HEADERS });
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least 1 uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least 1 number.';
  }
  return null;
}

function decodeJwtRole(token: string): string | null {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;
  try {
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

function decodeJwtRef(token: string): string | null {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;
  try {
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { ref?: unknown };
    return typeof parsed.ref === 'string' ? parsed.ref : null;
  } catch {
    return null;
  }
}

function extractSupabaseProjectRef(url: string): string | null {
  const match = url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co\b/i);
  return match?.[1] ?? null;
}

function getServiceRoleKey(): string {
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
  const role = decodeJwtRole(serviceKey);
  if (!serviceKey || serviceKey === anonKey || (role !== 'service_role' && role !== 'supabase_admin')) {
    throw new Error('A backend-only Supabase service-role key is required for owner password reset.');
  }
  return serviceKey;
}

function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured on the backend.');
  }
  const urlRef = extractSupabaseProjectRef(supabaseUrl);
  const keyRef = decodeJwtRef(serviceRoleKey);
  if (urlRef && keyRef && urlRef !== keyRef) {
    throw new Error(`Supabase project mismatch: EXPO_PUBLIC_SUPABASE_URL points to ${urlRef} but the service-role key belongs to ${keyRef}.`);
  }
  const runtimeFetch = ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: runtimeFetch },
  });
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  const visibleLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${visibleLocal}@${domain}`;
}

export function ownerPasswordResetOptions(): Response {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function handleIVXOwnerPasswordReset(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Method not allowed.', secretValuesReturned: false }, 405);
  }

  try {
    const { context } = await assertIVXRegisteredOwnerBearer(request, 'owner_password_reset');
    const email = sanitizeEmail(context.email ?? '');
    if (!email) {
      return json({ success: false, message: 'Owner email could not be determined from bearer.', secretValuesReturned: false }, 400);
    }

    const body = await request.json().catch(() => ({})) as OwnerPasswordResetPayload;
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return json({ success: false, message: passwordError, secretValuesReturned: false }, 400);
    }

    const client = createSupabaseAdminClient();
    const { data: usersData, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      return json({ success: false, message: listError.message, secretValuesReturned: false }, 502);
    }

    const user = usersData.users.find((u) => sanitizeEmail(u.email ?? '') === email);
    if (!user) {
      return json({ success: false, message: 'Owner auth user not found in Supabase.', secretValuesReturned: false }, 404);
    }

    const { error: updateError } = await client.auth.admin.updateUserById(user.id, {
      password: newPassword,
      email_confirm: true,
    });

    if (updateError) {
      return json({ success: false, message: updateError.message, secretValuesReturned: false }, 502);
    }

    return json({
      success: true,
      message: 'Owner password reset successfully. You can now sign in with the new password on this device.',
      emailMasked: maskEmail(email),
      userId: user.id,
      secretValuesReturned: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner password reset failed.';
    const status = message.toLowerCase().includes('missing bearer') ? 401 : 403;
    return json({ success: false, message, secretValuesReturned: false }, status);
  }
}

// IVX owner password reset endpoint — deployed and verified live.
