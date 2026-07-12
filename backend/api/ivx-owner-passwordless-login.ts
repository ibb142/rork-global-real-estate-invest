/**
 * Passwordless owner sign-in.
 *
 * POST /api/ivx/owner-passwordless-login
 *   body: { email }
 *
 * The owner types ONLY their email. The backend:
 *   1. Validates the email is in the owner allowlist
 *      (IVX_OWNER_REGISTRATION_EMAILS / IVX_BASELINE_OWNER_EMAILS).
 *   2. Uses the Supabase admin (service-role) client to find the owner auth user
 *      (creating + confirming them if they do not exist yet).
 *   3. Self-heals: sets the user's password to the configured
 *      IVX_OWNER_PASSWORD so the password grant always succeeds, even if the
 *      password drifted in Supabase. This is the fix for the recurring
 *      "invalid_credentials" block the owner hit.
 *   4. Performs a server-side password grant against Supabase Auth and returns
 *      the resulting session tokens (access_token, refresh_token, expires_at).
 *
 * The password is NEVER sent back to the client. The client installs the
 * returned session via supabase.auth.setSession(), which produces a real
 * Supabase session — so owner-AI chat approval (allowlist + bearer check)
 * works automatically.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { getIVXOwnerEmailAllowlist } from '../../expo/shared/ivx/access-control';

const DEPLOYMENT_MARKER = 'ivx-owner-passwordless-login-2026-07-06t0000z';

const PASSWORDLESS_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeEmail(value: unknown): string {
  return readTrimmed(value).toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function nowIso(): string {
  return new Date().toISOString();
}

function json(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: PASSWORDLESS_HEADERS });
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function resolveSupabaseUrl(): string {
  return readEnv('EXPO_PUBLIC_SUPABASE_URL') || readEnv('SUPABASE_URL');
}

function resolveServiceRoleKey(): string {
  return readEnv('SUPABASE_SERVICE_ROLE_KEY') || readEnv('SUPABASE_SERVICE_KEY');
}

function resolveAnonKey(): string {
  return readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

function createAdminClient() {
  const supabaseUrl = resolveSupabaseUrl();
  const serviceRoleKey = resolveServiceRoleKey();
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured on the backend (EXPO_PUBLIC_SUPABASE_URL).');
  }
  if (!serviceRoleKey) {
    throw new Error('Supabase service role key is not configured on the backend (SUPABASE_SERVICE_ROLE_KEY).');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type OwnerSessionResponse = {
  success: true;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  expiresAtIso: string;
  userId: string;
  email: string;
  passwordSelfHealed: boolean;
  authUserCreated: boolean;
  deploymentMarker: string;
  timestamp: string;
};

type OwnerSessionFailure = {
  success: false;
  message: string;
  rootCause: string;
  deploymentMarker: string;
  timestamp: string;
};

/** Server-side password grant against the Supabase Auth token endpoint. */
async function passwordGrant(supabaseUrl: string, email: string, password: string): Promise<{
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  errorMessage?: string;
  errorStatus?: number;
}> {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`;
  const anonKey = resolveAnonKey();
  if (!anonKey) {
    return { ok: false, errorMessage: 'Supabase anon key is not configured on the backend.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { ok: false, errorMessage: `Supabase returned non-JSON auth response (HTTP ${response.status}).` };
    }
    if (!response.ok) {
      const message = typeof parsed.error_description === 'string'
        ? parsed.error_description
        : typeof parsed.msg === 'string'
          ? parsed.msg
          : typeof parsed.error === 'string'
            ? parsed.error
            : `Supabase rejected the password grant (HTTP ${response.status}).`;
      return { ok: false, errorMessage: message, errorStatus: response.status };
    }
    const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : '';
    const refreshToken = typeof parsed.refresh_token === 'string' ? parsed.refresh_token : '';
    const expiresAt = typeof parsed.expires_at === 'number' ? parsed.expires_at : 0;
    if (!accessToken || !refreshToken) {
      return { ok: false, errorMessage: 'Supabase did not return access_token/refresh_token.' };
    }
    return { ok: true, accessToken, refreshToken, expiresAt };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : 'Network failure during password grant.' };
  } finally {
    clearTimeout(timer);
  }
}

export function ivxOwnerPasswordlessLoginOptions(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXOwnerPasswordlessLogin(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return ownerOnlyJson({ success: false, message: 'Method not allowed.', deploymentMarker: DEPLOYMENT_MARKER }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const email = sanitizeEmail(body.email);

  if (!isValidEmail(email)) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: 'A valid owner email is required.',
      rootCause: 'missing_or_invalid_email',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 400);
  }

  const allowlist = getIVXOwnerEmailAllowlist();
  if (!allowlist.includes(email)) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: 'This email is not on the owner allowlist. Owner login is restricted to the configured owner.',
      rootCause: 'email_not_allowlisted',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 403);
  }

  const ownerPassword = readEnv('IVX_OWNER_PASSWORD');
  if (!ownerPassword) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: 'IVX_OWNER_PASSWORD is not configured on the backend. Set it in the Render environment to enable passwordless owner login.',
      rootCause: 'owner_password_not_configured',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 500);
  }

  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: 'Supabase URL is not configured on the backend.',
      rootCause: 'supabase_url_not_configured',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 500);
  }

  let adminClient: SupabaseClient;
  try {
    adminClient = createAdminClient();
  } catch (error) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to initialize Supabase admin client.',
      rootCause: 'admin_client_init_failed',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 500);
  }

  // Locate the owner auth user (list + match by email).
  let authUserId: string | null = null;
  let authUserCreated = false;
  try {
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      const failure: OwnerSessionFailure = {
        success: false,
        message: `Supabase admin listUsers failed: ${listError.message}`,
        rootCause: 'admin_list_users_failed',
        deploymentMarker: DEPLOYMENT_MARKER,
        timestamp: nowIso(),
      };
      return ownerOnlyJson(failure, 502);
    }
    const users = Array.isArray(listData?.users) ? listData.users : [];
    const match = users.find((u) => sanitizeEmail(u.email) === email);
    authUserId = match?.id ?? null;
  } catch (error) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to list Supabase auth users.',
      rootCause: 'admin_list_users_threw',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 502);
  }

  let passwordSelfHealed = false;

  if (!authUserId) {
    // Create the owner auth user with the configured password + confirmed email.
    try {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: {
          accountType: 'owner',
          requestedRole: 'owner',
          role: 'owner',
          status: 'active',
          kycStatus: 'approved',
        },
        app_metadata: {
          accountType: 'owner',
          requestedRole: 'owner',
          role: 'owner',
        },
      });
      if (error || !data.user) {
        const failure: OwnerSessionFailure = {
          success: false,
          message: error?.message ?? 'Supabase did not return a created owner user.',
          rootCause: 'admin_create_user_failed',
          deploymentMarker: DEPLOYMENT_MARKER,
          timestamp: nowIso(),
        };
        return ownerOnlyJson(failure, 502);
      }
      authUserId = data.user.id;
      authUserCreated = true;
      passwordSelfHealed = true;
    } catch (error) {
      const failure: OwnerSessionFailure = {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create owner auth user.',
        rootCause: 'admin_create_user_threw',
        deploymentMarker: DEPLOYMENT_MARKER,
        timestamp: nowIso(),
      };
      return ownerOnlyJson(failure, 502);
    }
  } else {
    // Self-heal: reset the password to the configured value so the password
    // grant always succeeds, regardless of any drift in Supabase.
    try {
      const { error: updateError } = await adminClient.auth.admin.updateUserById(authUserId, {
        password: ownerPassword,
        email_confirm: true,
        ban_duration: 'none',
      });
      if (updateError) {
        const failure: OwnerSessionFailure = {
          success: false,
          message: `Self-healing password reset failed: ${updateError.message}`,
          rootCause: 'admin_update_password_failed',
          deploymentMarker: DEPLOYMENT_MARKER,
          timestamp: nowIso(),
        };
        return ownerOnlyJson(failure, 502);
      }
      passwordSelfHealed = true;
    } catch (error) {
      const failure: OwnerSessionFailure = {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to reset owner password.',
        rootCause: 'admin_update_password_threw',
        deploymentMarker: DEPLOYMENT_MARKER,
        timestamp: nowIso(),
      };
      return ownerOnlyJson(failure, 502);
    }
  }

  // Perform the server-side password grant to mint a real session.
  const grant = await passwordGrant(supabaseUrl, email, ownerPassword);
  if (!grant.ok || !grant.accessToken || !grant.refreshToken) {
    const failure: OwnerSessionFailure = {
      success: false,
      message: grant.errorMessage ?? 'Password grant failed.',
      rootCause: 'password_grant_failed',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    };
    return ownerOnlyJson(failure, 502);
  }

  const expiresAt = grant.expiresAt ?? 0;
  const successPayload: OwnerSessionResponse = {
    success: true,
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt,
    expiresAtIso: expiresAt ? new Date(expiresAt * 1000).toISOString() : nowIso(),
    userId: authUserId,
    email,
    passwordSelfHealed,
    authUserCreated,
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
  };
  return ownerOnlyJson(successPayload as unknown as Record<string, unknown>);
}
