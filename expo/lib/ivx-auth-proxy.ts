/**
 * IVX Auth Proxy — Backend-mediated Supabase authentication.
 *
 * The Expo app may not have EXPO_PUBLIC_SUPABASE_ANON_KEY configured.
 * This service authenticates through the IVX backend's /api/ivx/owner-auth/*
 * endpoints, which use the service role key server-side.
 *
 * Flow:
 *   1. login(email, password) → POST /api/ivx/owner-auth/login → session tokens
 *   2. recover(email) → POST /api/ivx/owner-auth/recover → reset email sent
 *   3. exchangeRecovery(code) → POST /api/ivx/owner-auth/exchange-recovery → session
 *   4. updatePassword(accessToken, newPassword) → POST /api/ivx/owner-auth/update-password
 *   5. repair(email, newPassword) → POST /api/ivx/owner-auth/repair → full V7 repair
 *   6. refresh(refreshToken) → POST /api/ivx/owner-auth/refresh → new session
 */

import { getApiBaseUrl } from './api-base';

const REQUEST_TIMEOUT_MS = 20_000;

/** Canonical production URLs tried in order if env-based URL fails. */
const BACKEND_URL_CANDIDATES: string[] = [
  getApiBaseUrl(),
  'https://api.ivxholding.com',
  'https://ivx-holdings-platform.onrender.com',
];

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function getUniqueBackendUrls(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of BACKEND_URL_CANDIDATES) {
    const url = normalizeUrl(raw);
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ProxySession {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  expiresInSeconds: number | null;
  tokenType: string;
}

export interface ProxyUser {
  id: string | null;
  email: string | null;
  emailConfirmed: boolean;
  role: string | null;
  accountType: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string | null;
}

export interface ProxyLoginResult {
  ok: boolean;
  session?: ProxySession;
  user?: ProxyUser | null;
  maskedEmail?: string;
  error?: string;
  httpStatus?: number;
  authProxyUsed?: boolean;
}

export interface ProxyRecoverResult {
  ok: boolean;
  sent: boolean;
  maskedEmail?: string;
  message?: string;
  error?: string;
  httpStatus?: number;
}

export interface ProxyRepairResult {
  ok: boolean;
  action?: string;
  passwordReset?: boolean;
  emailConfirmed?: boolean;
  maskedEmail?: string;
  message?: string;
  loginReady?: boolean;
  error?: string;
}

export interface ProxyExchangeRecoveryResult {
  ok: boolean;
  session?: ProxySession;
  user?: { id: string | null; email: string | null; emailConfirmed: boolean } | null;
  maskedEmail?: string;
  error?: string;
}

export interface ProxyUpdatePasswordResult {
  ok: boolean;
  passwordUpdated?: boolean;
  maskedEmail?: string;
  message?: string;
  error?: string;
}

export interface ProxyDiagnosticResult {
  ok: boolean;
  authProxyActive: boolean;
  bypassesAnonKey: boolean;
  serviceRoleKeyPresent: boolean;
  anonKeyPresent: boolean;
  supabaseUrlPresent: boolean;
}

/**
 * GET /api/ivx/owner-auth/diagnostic — check if the backend proxy is live.
 */
export async function checkAuthProxyDiagnostic(): Promise<ProxyDiagnosticResult | null> {
  const urls = getUniqueBackendUrls();
  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/diagnostic`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) continue;
      const data = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!data) continue;
      const backend = (data.backend ?? {}) as Record<string, unknown>;
      return {
        ok: Boolean(data.ok),
        authProxyActive: Boolean(backend.authProxyActive),
        bypassesAnonKey: Boolean(backend.bypassesAnonKey),
        serviceRoleKeyPresent: Boolean(backend.serviceRoleKeyPresent),
        anonKeyPresent: Boolean(backend.anonKeyPresent),
        supabaseUrlPresent: Boolean(backend.supabaseUrlPresent),
      };
    } catch {
      // Try next URL candidate
    }
  }
  return null;
}

/**
 * POST /api/ivx/owner-auth/login — authenticate with email + password.
 * Returns session tokens that can be used to set a Supabase session.
 */
export async function proxyLogin(email: string, password: string): Promise<ProxyLoginResult> {
  const urls = getUniqueBackendUrls();
  let lastError = 'No backend URL candidate was reachable.';

  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/login`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok && data.ok) {
        const session = (data.session ?? {}) as Record<string, unknown>;
        const user = (data.user ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          session: {
            accessToken: typeof session.accessToken === 'string' ? session.accessToken : null,
            refreshToken: typeof session.refreshToken === 'string' ? session.refreshToken : null,
            expiresAt: typeof session.expiresAt === 'number' ? session.expiresAt : null,
            expiresInSeconds: typeof session.expiresInSeconds === 'number' ? session.expiresInSeconds : null,
            tokenType: typeof session.tokenType === 'string' ? session.tokenType : 'bearer',
          },
          user: {
            id: typeof user.id === 'string' ? user.id : null,
            email: typeof user.email === 'string' ? user.email : null,
            emailConfirmed: Boolean(user.emailConfirmed),
            role: typeof user.role === 'string' ? user.role : null,
            accountType: typeof user.accountType === 'string' ? user.accountType : null,
            firstName: typeof user.firstName === 'string' ? user.firstName : null,
            lastName: typeof user.lastName === 'string' ? user.lastName : null,
            createdAt: typeof user.createdAt === 'string' ? user.createdAt : null,
          },
          maskedEmail: typeof data.maskedEmail === 'string' ? data.maskedEmail : undefined,
          authProxyUsed: true,
        };
      }

      lastError = typeof data.error === 'string' ? data.error : `Login failed (HTTP ${response.status}).`;
      // If we got a non-404 response, the endpoint exists — don't try other URLs
      if (response.status !== 404 && response.status !== 502) {
        return {
          ok: false,
          error: lastError,
          httpStatus: response.status,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error during login.';
    }
  }

  return { ok: false, error: lastError };
}

/**
 * POST /api/ivx/owner-auth/recover — send a password reset email.
 */
export async function proxyRecover(email: string, redirectTo?: string): Promise<ProxyRecoverResult> {
  const urls = getUniqueBackendUrls();
  let lastError = 'No backend URL candidate was reachable.';

  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/recover`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          ...(redirectTo ? { redirectTo } : {}),
        }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok || response.status === 200) {
        return {
          ok: Boolean(data.ok),
          sent: Boolean(data.sent),
          maskedEmail: typeof data.maskedEmail === 'string' ? data.maskedEmail : undefined,
          message: typeof data.message === 'string' ? data.message : undefined,
        };
      }

      lastError = typeof data.error === 'string' ? data.error : `Recovery request failed (HTTP ${response.status}).`;
      if (response.status !== 404 && response.status !== 502) {
        return {
          ok: false,
          sent: false,
          error: lastError,
          httpStatus: response.status,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error during recovery.';
    }
  }

  return { ok: false, sent: false, error: lastError };
}

/**
 * POST /api/ivx/owner-auth/repair — full V7 owner repair (create/reset password + confirm email).
 */
export async function proxyRepair(email: string, newPassword: string, phone?: string): Promise<ProxyRepairResult> {
  const urls = getUniqueBackendUrls();
  let lastError = 'No backend URL candidate was reachable.';

  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/repair`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          newPassword,
          ...(phone ? { phone } : {}),
        }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok && data.ok) {
        return {
          ok: true,
          action: typeof data.action === 'string' ? data.action : undefined,
          passwordReset: Boolean(data.passwordReset),
          emailConfirmed: Boolean(data.emailConfirmed),
          maskedEmail: typeof data.maskedEmail === 'string' ? data.maskedEmail : undefined,
          message: typeof data.message === 'string' ? data.message : undefined,
          loginReady: Boolean(data.loginReady),
        };
      }

      lastError = typeof data.error === 'string' ? data.error : `Repair failed (HTTP ${response.status}).`;
      if (response.status !== 404 && response.status !== 502) {
        return { ok: false, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error during repair.';
    }
  }

  return { ok: false, error: lastError };
}

/**
 * POST /api/ivx/owner-auth/exchange-recovery — exchange a recovery code for a session.
 */
export async function proxyExchangeRecovery(code: string): Promise<ProxyExchangeRecoveryResult> {
  const urls = getUniqueBackendUrls();
  let lastError = 'No backend URL candidate was reachable.';

  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/exchange-recovery`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok && data.ok) {
        const session = (data.session ?? {}) as Record<string, unknown>;
        const user = (data.user ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          session: {
            accessToken: typeof session.accessToken === 'string' ? session.accessToken : null,
            refreshToken: typeof session.refreshToken === 'string' ? session.refreshToken : null,
            expiresAt: typeof session.expiresAt === 'number' ? session.expiresAt : null,
            expiresInSeconds: typeof session.expiresInSeconds === 'number' ? session.expiresInSeconds : null,
            tokenType: typeof session.tokenType === 'string' ? session.tokenType : 'bearer',
          },
          user: {
            id: typeof user.id === 'string' ? user.id : null,
            email: typeof user.email === 'string' ? user.email : null,
            emailConfirmed: Boolean(user.emailConfirmed),
          },
          maskedEmail: typeof data.maskedEmail === 'string' ? data.maskedEmail : undefined,
        };
      }

      lastError = typeof data.error === 'string' ? data.error : `Exchange failed (HTTP ${response.status}).`;
      if (response.status !== 404 && response.status !== 502) {
        return { ok: false, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error during exchange.';
    }
  }

  return { ok: false, error: lastError };
}

/**
 * POST /api/ivx/owner-auth/update-password — update password using an access token.
 */
export async function proxyUpdatePassword(accessToken: string, newPassword: string): Promise<ProxyUpdatePasswordResult> {
  const urls = getUniqueBackendUrls();
  let lastError = 'No backend URL candidate was reachable.';

  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/update-password`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ accessToken, newPassword }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok && data.ok) {
        return {
          ok: true,
          passwordUpdated: Boolean(data.passwordUpdated),
          maskedEmail: typeof data.maskedEmail === 'string' ? data.maskedEmail : undefined,
          message: typeof data.message === 'string' ? data.message : undefined,
        };
      }

      lastError = typeof data.error === 'string' ? data.error : `Update failed (HTTP ${response.status}).`;
      if (response.status !== 404 && response.status !== 502) {
        return { ok: false, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error during update.';
    }
  }

  return { ok: false, error: lastError };
}

/**
 * POST /api/ivx/owner-auth/refresh — refresh a session using a refresh token.
 */
export async function proxyRefresh(refreshToken: string): Promise<ProxyLoginResult> {
  const urls = getUniqueBackendUrls();
  let lastError = 'No backend URL candidate was reachable.';

  for (const baseUrl of urls) {
    const endpoint = `${baseUrl}/api/ivx/owner-auth/refresh`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok && data.ok) {
        const session = (data.session ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          session: {
            accessToken: typeof session.accessToken === 'string' ? session.accessToken : null,
            refreshToken: typeof session.refreshToken === 'string' ? session.refreshToken : null,
            expiresAt: typeof session.expiresAt === 'number' ? session.expiresAt : null,
            expiresInSeconds: typeof session.expiresInSeconds === 'number' ? session.expiresInSeconds : null,
            tokenType: typeof session.tokenType === 'string' ? session.tokenType : 'bearer',
          },
          authProxyUsed: true,
        };
      }

      lastError = typeof data.error === 'string' ? data.error : `Refresh failed (HTTP ${response.status}).`;
      if (response.status !== 404 && response.status !== 502) {
        return { ok: false, error: lastError, httpStatus: response.status };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network error during refresh.';
    }
  }

  return { ok: false, error: lastError };
}
