/**
 * IVX Owner Auth Proxy — Backend-mediated Supabase authentication.
 *
 * The production backend has SUPABASE_SERVICE_ROLE_KEY but is missing
 * EXPO_PUBLIC_SUPABASE_ANON_KEY. This proxy lets the iOS app authenticate
 * through the backend using the service role key, so owner login works
 * even when the anon key is not configured on Render.
 *
 * Security:
 *   - Uses service role key ONLY for Supabase admin operations
 *   - Never returns the service role key
 *   - Returns the user's own access/refresh token (not a secret)
 *   - Rate-limited per IP + email
 *   - Password validation matches the V7 registration rules
 *
 * Endpoints:
 *   POST /api/ivx/owner-auth/login     — email + password → session tokens
 *   POST /api/ivx/owner-auth/refresh   — refresh token → new session
 *   POST /api/ivx/owner-auth/recover   — email → password reset email
 *   POST /api/ivx/owner-auth/repair    — email + newPassword → V7 full repair
 *   GET  /api/ivx/owner-auth/diagnostic — backend auth readiness probe
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEPLOYMENT_MARKER = 'ivx-owner-auth-proxy-2026-07-03T14:00:00Z';
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function nowIso(): string {
  return new Date().toISOString();
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function json(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

export function ownerAuthProxyOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

function readClientIp(request: Request): string {
  const forwarded = readTrimmed(request.headers.get('x-forwarded-for')).split(',')[0]?.trim();
  return forwarded || readTrimmed(request.headers.get('cf-connecting-ip')) || readTrimmed(request.headers.get('x-real-ip')) || 'unknown';
}

function assertRateLimit(key: string): void {
  const now = Date.now();
  const current = rateLimitMap.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + REQUEST_WINDOW_MS });
    return;
  }
  if (current.count >= MAX_REQUESTS) {
    throw new Error('Rate limited. Wait 60 seconds before retrying.');
  }
  current.count++;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least 1 uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least 1 number.';
  return null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getServiceRoleKey(): string {
  const key = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the backend.');
  }
  return key;
}

function getSupabaseUrl(): string {
  const url = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL) || readTrimmed(process.env.SUPABASE_URL);
  if (!url) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured on the backend.');
  }
  return url.replace(/\/+$/, '');
}

function createAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch },
  });
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

type LoginPayload = { email?: unknown; password?: unknown };
type RefreshPayload = { refreshToken?: unknown };
type RecoverPayload = { email?: unknown; redirectTo?: unknown };
type RepairPayload = { email?: unknown; newPassword?: unknown; phone?: unknown };

/**
 * GET /api/ivx/owner-auth/diagnostic — no auth required.
 * Returns backend auth readiness without exposing secrets.
 */
export function handleIVXOwnerAuthDiagnostic(): Response {
  const supabaseUrl = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL) || readTrimmed(process.env.SUPABASE_URL);
  const serviceRolePresent = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY).length > 0;
  const anonKeyPresent = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).length > 0;

  return json({
    ok: true,
    route: 'GET /api/ivx/owner-auth/diagnostic',
    deploymentMarker: DEPLOYMENT_MARKER,
    backend: {
      supabaseUrlPresent: Boolean(supabaseUrl),
      supabaseUrl: supabaseUrl || null,
      serviceRoleKeyPresent: serviceRolePresent,
      anonKeyPresent,
      anonKeyMissing: !anonKeyPresent,
      authProxyActive: serviceRolePresent && Boolean(supabaseUrl),
      bypassesAnonKey: !anonKeyPresent && serviceRolePresent,
    },
    endpoints: {
      login: 'POST /api/ivx/owner-auth/login',
      refresh: 'POST /api/ivx/owner-auth/refresh',
      recover: 'POST /api/ivx/owner-auth/recover',
      repair: 'POST /api/ivx/owner-auth/repair',
    },
    secretValuesReturned: false,
    timestamp: nowIso(),
  });
}

/**
 * POST /api/ivx/owner-auth/login
 * Body: { email, password }
 * Returns: { access_token, refresh_token, expires_at, user } on success
 *
 * Uses the Supabase REST auth endpoint directly with the service role key
 * as the apikey header — the GoTrue server accepts the service role key
 * for password grant when the anon key is not available.
 */
export async function handleIVXOwnerAuthLogin(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const body = await request.json().catch(() => ({})) as LoginPayload;
    const email = readTrimmed(body.email).toLowerCase();
    const password = readTrimmed(body.password);

    if (!isValidEmail(email)) {
      return json({ ok: false, error: 'A valid email is required.' }, 400);
    }
    if (!password || password.length < 8) {
      return json({ ok: false, error: 'Password must be at least 8 characters.' }, 400);
    }

    const ip = readClientIp(request);
    assertRateLimit(`login:${email}:${ip}`);

    const supabaseUrl = getSupabaseUrl();
    const serviceKey = getServiceRoleKey();

    // Call Supabase GoTrue password grant endpoint directly.
    // The service role key is accepted as apikey for the token endpoint.
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg = typeof data.error_description === 'string'
        ? data.error_description
        : typeof data.message === 'string'
          ? data.message
          : typeof data.error === 'string'
            ? data.error
            : `Authentication failed (HTTP ${response.status}).`;

      const isInvalidCreds = response.status === 400 || response.status === 401;
      return json({
        ok: false,
        error: isInvalidCreds ? 'Invalid email or password.' : errorMsg,
        httpStatus: response.status,
        maskedEmail: maskEmail(email),
        deploymentMarker: DEPLOYMENT_MARKER,
        secretValuesReturned: false,
        timestamp: nowIso(),
      }, isInvalidCreds ? 401 : response.status);
    }

    // Success — return the session tokens to the client
    const accessToken = typeof data.access_token === 'string' ? data.access_token : null;
    const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : null;
    const expiresAt = typeof data.expires_at === 'number' ? data.expires_at : null;
    const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : null;
    const tokenType = typeof data.token_type === 'string' ? data.token_type : 'bearer';
    const user = data.user as Record<string, unknown> | undefined;

    if (!accessToken) {
      return json({ ok: false, error: 'Supabase did not return an access token.', deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false }, 502);
    }

    return json({
      ok: true,
      session: {
        accessToken,
        refreshToken,
        expiresAt,
        expiresInSeconds,
        tokenType,
      },
      user: user ? {
        id: typeof user.id === 'string' ? user.id : null,
        email: typeof user.email === 'string' ? user.email : null,
        emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        createdAt: typeof user.created_at === 'string' ? user.created_at : null,
        role: (user.app_metadata as Record<string, unknown>)?.role as string ?? null,
        accountType: (user.app_metadata as Record<string, unknown>)?.accountType as string ?? null,
        firstName: (user.user_metadata as Record<string, unknown>)?.firstName as string ?? null,
        lastName: (user.user_metadata as Record<string, unknown>)?.lastName as string ?? null,
      } : null,
      maskedEmail: maskEmail(email),
      authProxyUsed: true,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner auth login failed.';
    const isRateLimit = message.toLowerCase().includes('rate limited');
    return json({
      ok: false,
      error: message,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp: nowIso(),
    }, isRateLimit ? 429 : 500);
  }
}

/**
 * POST /api/ivx/owner-auth/refresh
 * Body: { refreshToken }
 * Returns: { access_token, refresh_token, expires_at } on success
 */
export async function handleIVXOwnerAuthRefresh(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const body = await request.json().catch(() => ({})) as RefreshPayload;
    const refreshToken = readTrimmed(body.refreshToken);

    if (!refreshToken) {
      return json({ ok: false, error: 'A refresh token is required.' }, 400);
    }

    const ip = readClientIp(request);
    assertRateLimit(`refresh:${ip}`);

    const supabaseUrl = getSupabaseUrl();
    const serviceKey = getServiceRoleKey();

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      return json({
        ok: false,
        error: typeof data.error === 'string' ? data.error : `Token refresh failed (HTTP ${response.status}).`,
        httpStatus: response.status,
        deploymentMarker: DEPLOYMENT_MARKER,
        secretValuesReturned: false,
        timestamp: nowIso(),
      }, response.status);
    }

    return json({
      ok: true,
      session: {
        accessToken: typeof data.access_token === 'string' ? data.access_token : null,
        refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
        expiresAt: typeof data.expires_at === 'number' ? data.expires_at : null,
        expiresInSeconds: typeof data.expires_in === 'number' ? data.expires_in : null,
        tokenType: typeof data.token_type === 'string' ? data.token_type : 'bearer',
      },
      authProxyUsed: true,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed.';
    return json({ ok: false, error: message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp: nowIso() }, 500);
  }
}

/**
 * POST /api/ivx/owner-auth/recover
 * Body: { email, redirectTo? }
 * Sends a password reset email via Supabase GoTrue.
 */
export async function handleIVXOwnerAuthRecover(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const body = await request.json().catch(() => ({})) as RecoverPayload;
    const email = readTrimmed(body.email).toLowerCase();
    const redirectTo = readTrimmed(body.redirectTo) || 'https://ivxholding.com/reset-password';

    if (!isValidEmail(email)) {
      return json({ ok: false, error: 'A valid email is required.' }, 400);
    }

    const ip = readClientIp(request);
    assertRateLimit(`recover:${email}:${ip}`);

    const supabaseUrl = getSupabaseUrl();
    const serviceKey = getServiceRoleKey();

    const response = await fetch(`${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(15000),
    });

    return json({
      ok: response.ok,
      httpStatus: response.status,
      sent: response.ok,
      maskedEmail: maskEmail(email),
      message: response.ok ? 'Password reset email sent.' : `Reset email request returned HTTP ${response.status}.`,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password recovery request failed.';
    return json({ ok: false, error: message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp: nowIso() }, 500);
  }
}

type ExchangeRecoveryPayload = { code?: unknown; type?: unknown };
type UpdatePasswordPayload = { accessToken?: unknown; newPassword?: unknown };

/**
 * POST /api/ivx/owner-auth/exchange-recovery
 * Body: { code }
 * Exchanges a Supabase password recovery code for a session.
 * This lets the mobile app complete the reset-password flow without the anon key.
 */
export async function handleIVXOwnerAuthExchangeRecovery(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const body = await request.json().catch(() => ({})) as ExchangeRecoveryPayload;
    const code = readTrimmed(body.code);

    if (!code) {
      return json({ ok: false, error: 'A recovery code is required.' }, 400);
    }

    const ip = readClientIp(request);
    assertRateLimit(`exchange:${ip}`);

    const supabaseUrl = getSupabaseUrl();
    const serviceKey = getServiceRoleKey();

    // Exchange the recovery code for a session using GoTrue's token endpoint
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ auth_code: code }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      return json({
        ok: false,
        error: typeof data.error_description === 'string'
          ? data.error_description
          : typeof data.message === 'string'
            ? data.message
            : `Recovery code exchange failed (HTTP ${response.status}).`,
        httpStatus: response.status,
        deploymentMarker: DEPLOYMENT_MARKER,
        secretValuesReturned: false,
        timestamp: nowIso(),
      }, response.status);
    }

    const accessToken = typeof data.access_token === 'string' ? data.access_token : null;
    const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : null;
    const expiresAt = typeof data.expires_at === 'number' ? data.expires_at : null;
    const user = data.user as Record<string, unknown> | undefined;
    const userEmail = typeof user?.email === 'string' ? user.email : null;

    return json({
      ok: true,
      session: {
        accessToken,
        refreshToken,
        expiresAt,
        expiresInSeconds: typeof data.expires_in === 'number' ? data.expires_in : null,
        tokenType: typeof data.token_type === 'string' ? data.token_type : 'bearer',
      },
      user: user ? {
        id: typeof user.id === 'string' ? user.id : null,
        email: userEmail,
        emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
      } : null,
      maskedEmail: userEmail ? maskEmail(userEmail) : null,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recovery code exchange failed.';
    return json({ ok: false, error: message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp: nowIso() }, 500);
  }
}

/**
 * POST /api/ivx/owner-auth/update-password
 * Body: { accessToken, newPassword }
 * Updates the user's password using their existing access token (from recovery exchange).
 */
export async function handleIVXOwnerAuthUpdatePassword(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const body = await request.json().catch(() => ({})) as UpdatePasswordPayload;
    const accessToken = readTrimmed(body.accessToken);
    const newPassword = readTrimmed(body.newPassword);

    if (!accessToken) {
      return json({ ok: false, error: 'An access token is required.' }, 400);
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return json({ ok: false, error: passwordError }, 400);
    }

    const ip = readClientIp(request);
    assertRateLimit(`updatepw:${ip}`);

    const supabaseUrl = getSupabaseUrl();
    const serviceKey = getServiceRoleKey();

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      return json({
        ok: false,
        error: typeof data.error_description === 'string'
          ? data.error_description
          : typeof data.message === 'string'
            ? data.message
            : `Password update failed (HTTP ${response.status}).`,
        httpStatus: response.status,
        deploymentMarker: DEPLOYMENT_MARKER,
        secretValuesReturned: false,
        timestamp: nowIso(),
      }, response.status);
    }

    const user = data as Record<string, unknown> | undefined;
    const userEmail = typeof user?.email === 'string' ? user.email : null;

    return json({
      ok: true,
      passwordUpdated: true,
      maskedEmail: userEmail ? maskEmail(userEmail) : null,
      message: 'Password updated successfully. You can now sign in with your new password.',
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password update failed.';
    return json({ ok: false, error: message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp: nowIso() }, 500);
  }
}

/**
 * POST /api/ivx/owner-auth/repair
 * Body: { email, newPassword, phone? }
 *
 * Full V7 repair: resets the owner password using the service role key,
 * confirms email, repairs profile/wallet, and returns login-ready status.
 * This is the emergency recovery path that works without the anon key.
 */
export async function handleIVXOwnerAuthRepair(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405);
    }

    const body = await request.json().catch(() => ({})) as RepairPayload;
    const email = readTrimmed(body.email).toLowerCase();
    const newPassword = readTrimmed(body.newPassword);
    const phone = readTrimmed(body.phone);

    if (!isValidEmail(email)) {
      return json({ ok: false, error: 'A valid owner email is required.' }, 400);
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return json({ ok: false, error: passwordError }, 400);
    }

    const ip = readClientIp(request);
    assertRateLimit(`repair:${email}:${ip}`);

    const client = createAdminClient();
    const timestamp = nowIso();

    // List auth users to find the owner
    const { data: usersList, error: listError } = await client.auth.admin.listUsers();
    if (listError) {
      return json({ ok: false, error: 'Could not list auth users for repair.', detail: listError.message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp }, 502);
    }

    const authUsers = usersList?.users ?? [];
    const matchingUser = authUsers.find((u) => readTrimmed(u.email).toLowerCase() === email);

    const ownerMetadata = {
      firstName: 'Owner',
      lastName: '',
      phone,
      accountType: 'owner',
      requestedRole: 'owner',
      role: 'owner',
      status: 'active',
      kycStatus: 'approved',
      ownerAccessRepairedAt: timestamp,
    };

    if (!matchingUser) {
      // Create the owner user if they don't exist yet
      const { data: created, error: createError } = await client.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
        ...(phone ? { phone, phone_confirm: true } : {}),
        user_metadata: ownerMetadata,
        app_metadata: { accountType: 'owner', requestedRole: 'owner', role: 'owner' },
      });

      if (createError || !created.user) {
        return json({ ok: false, error: createError?.message ?? 'Failed to create owner user.', deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp }, 502);
      }

      return json({
        ok: true,
        action: 'created',
        authUserCreated: true,
        passwordReset: true,
        emailConfirmed: true,
        maskedEmail: maskEmail(email),
        message: 'Owner account created with password login. You can now sign in.',
        loginReady: true,
        deploymentMarker: DEPLOYMENT_MARKER,
        secretValuesReturned: false,
        timestamp,
      });
    }

    // Existing user — update password, confirm email, set owner metadata
    const { error: updateError } = await client.auth.admin.updateUserById(matchingUser.id, {
      email_confirm: true,
      ...(phone ? { phone, phone_confirm: true } : {}),
      password: newPassword,
      user_metadata: { ...(matchingUser.user_metadata ?? {}), ...ownerMetadata },
      app_metadata: { ...(matchingUser.app_metadata ?? {}), accountType: 'owner', requestedRole: 'owner', role: 'owner' },
      ban_duration: 'none',
    });

    if (updateError) {
      return json({ ok: false, error: updateError.message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp }, 502);
    }

    return json({
      ok: true,
      action: 'repaired',
      authUserCreated: false,
      passwordReset: true,
      emailConfirmed: true,
      maskedEmail: maskEmail(email),
      message: 'Owner password reset and email confirmed. You can now sign in with the new password.',
      loginReady: true,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
      timestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner auth repair failed.';
    const isRateLimit = message.toLowerCase().includes('rate limited');
    return json({ ok: false, error: message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false, timestamp: nowIso() }, isRateLimit ? 429 : 500);
  }
}
