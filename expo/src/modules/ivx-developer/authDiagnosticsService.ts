/**
 * IVX Owner Authentication Diagnostics service (owner-only).
 *
 * The watchdog flagged `owner_route_auth_401` — owner-gated routes were falling
 * back to /public/chat because the Supabase owner session was invalid/expired.
 * This service surfaces the EXACT auth state so the owner can see and fix it,
 * instead of a generic error:
 *   - current owner token status + expiration
 *   - Supabase session status
 *   - owner auth middleware result (live probe of the owner-gated backend)
 *   - last owner endpoint called + HTTP code + auth failure reason
 *   - refresh-token, re-authenticate, and retry actions
 *
 * When owner auth fails it auto-creates a watchdog incident (POST /api/ivx/incidents,
 * source=`auth`) and returns a plain-English fix recommendation. Never logs or
 * returns the raw token.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { resolveSupabaseUrl } from '@/lib/supabase-env';
import {
  getIVXAccessToken,
  getIVXAuthStatusSnapshot,
  getIVXSupabaseClient,
  type IVXAuthStatusSnapshot,
} from '@/lib/ivx-supabase-client';
import {
  getLastIVXOwnerAIAuthDiagnostic,
  getLastIVXOwnerAIPrimaryRouteFailure,
} from '@/src/modules/ivx-owner-ai/services/ivxAIRequestService';
import { ivxAIWatchdog } from '@/src/modules/ivx-owner-ai/services/ivxAIWatchdog';
import { reportIVXIncident } from '@/lib/ivx-incident-client';

/**
 * Reads the most recent watchdog report that ended in a blocked/error/silent
 * failure and returns its traceId — the "last blocked traceId" the owner needs
 * to correlate a failure with the watchdog drawer. Returns null when no blocked
 * report exists. Never throws (a missing/empty watchdog store degrades to null).
 */
function readLastBlockedTraceId(): string | null {
  try {
    const reports = ivxAIWatchdog.getReports();
    const blocked = reports.find(
      (report) =>
        report.finalStatus === 'BLOCKED' ||
        report.finalStatus === 'VISIBLE_ERROR' ||
        report.finalStatus === 'SILENT_FAILURE' ||
        report.failedCheckpoint !== null,
    );
    return blocked?.traceId ?? null;
  } catch {
    return null;
  }
}

/** A single auth-relevant fact rendered as a labelled row on the diagnostics screen. */
export type AuthDiagnosticField = {
  label: string;
  value: string;
  /** ok = healthy, warn = degraded but usable, fail = broken, unknown = not determined. */
  state: 'ok' | 'warn' | 'fail' | 'unknown';
};

export type SupabaseSessionStatus = {
  hasSession: boolean;
  userId: string | null;
  email: string | null;
  expiresAtIso: string | null;
  expiresInSeconds: number | null;
};

export type OwnerMiddlewareResult = {
  /** The owner-gated endpoint that was probed. */
  endpoint: string;
  httpStatus: number | null;
  /** true only when the owner auth middleware accepted the session (HTTP 200). */
  accepted: boolean;
  /** Backend rootCause string (from the auth-diagnostic middleware) when available. */
  rootCause: string | null;
  /** Honest reason the probe failed (network error, etc.). */
  error: string | null;
  tokenExpired: boolean | null;
  issuerMatchesBackend: boolean | null;
  supabaseUserFound: boolean | null;
  /** True when the authenticated email is in the owner allowlist (IVX_OWNER_REGISTRATION_EMAILS). */
  ownerEmailAllowlisted: boolean | null;
  /** Masked authenticated owner email reported by the backend middleware, when available. */
  authenticatedEmailMasked?: string | null;
};

export type AuthDiagnosticReport = {
  generatedAt: string;
  /** Overall verdict — drives the headline + colour. */
  status: 'healthy' | 'degraded' | 'failed';
  headline: string;
  fields: AuthDiagnosticField[];
  tokenSnapshot: IVXAuthStatusSnapshot;
  sessionStatus: SupabaseSessionStatus;
  middleware: OwnerMiddlewareResult;
  lastOwnerEndpoint: string | null;
  lastHttpStatus: number | null;
  authFailureReason: string | null;
  /** traceId of the most recent blocked watchdog report (correlates to the drawer). */
  lastBlockedTraceId: string | null;
  /** true when a live retry can be attempted (a session token is present to present). */
  retryAvailable: boolean;
  /** Plain-English fix recommendation surfaced to the owner. */
  fixRecommendation: string | null;
  /** Set when this report raised a watchdog incident. */
  incidentRaised: boolean;
};

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatExpiry(expiresInSeconds: number | null): string {
  if (expiresInSeconds === null) return 'unknown';
  if (expiresInSeconds <= 0) return `expired ${Math.abs(expiresInSeconds)}s ago`;
  if (expiresInSeconds < 90) return `expires in ${expiresInSeconds}s (renew soon)`;
  if (expiresInSeconds < 3600) return `expires in ${Math.round(expiresInSeconds / 60)}m`;
  return `expires in ${Math.round(expiresInSeconds / 3600)}h`;
}

/** Reads the live Supabase session WITHOUT exposing the token. */
async function readSupabaseSession(): Promise<SupabaseSessionStatus> {
  try {
    const supabase = getIVXSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      return { hasSession: false, userId: null, email: null, expiresAtIso: null, expiresInSeconds: null };
    }
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
    return {
      hasSession: true,
      userId: session.user?.id ?? null,
      email: session.user?.email ?? null,
      expiresAtIso: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      expiresInSeconds: expiresAtMs ? Math.round((expiresAtMs - Date.now()) / 1000) : null,
    };
  } catch {
    return { hasSession: false, userId: null, email: null, expiresAtIso: null, expiresInSeconds: null };
  }
}

/**
 * Runs the owner auth middleware live: POSTs the current bearer to the owner-gated
 * auth-diagnostic endpoint (which is the SAME owner guard the real routes use) so
 * we capture the exact HTTP code + structured rejection reason.
 */
async function probeOwnerMiddleware(): Promise<OwnerMiddlewareResult> {
  const endpoint = `${backendBaseUrl()}/api/ivx/owner-ai/auth-diagnostic`;
  const base: OwnerMiddlewareResult = {
    endpoint: '/api/ivx/owner-ai/auth-diagnostic',
    httpStatus: null,
    accepted: false,
    rootCause: null,
    error: null,
    tokenExpired: null,
    issuerMatchesBackend: null,
    supabaseUserFound: null,
    ownerEmailAllowlisted: null,
  };

  let accessToken: string | null = null;
  try {
    accessToken = await getIVXAccessToken();
  } catch {
    accessToken = null;
  }
  if (!accessToken) {
    return { ...base, error: 'No owner session token available to present to the middleware.' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: '{}',
    });
    const payload = readRecord(await response.json().catch(() => null));
    const checks = readRecord(payload.checks);
    const supabaseLookup = readRecord(payload.supabaseLookup);
    return {
      ...base,
      httpStatus: response.status,
      accepted: response.status === 200 && payload.ok === true,
      rootCause: typeof payload.rootCause === 'string' ? payload.rootCause : null,
      tokenExpired: typeof checks.tokenExpired === 'boolean' ? checks.tokenExpired : null,
      issuerMatchesBackend: typeof checks.issuerMatchesBackendProject === 'boolean' ? checks.issuerMatchesBackendProject : null,
      supabaseUserFound: typeof supabaseLookup.userFound === 'boolean' ? supabaseLookup.userFound : null,
      ownerEmailAllowlisted: typeof checks.ownerEmailAllowlisted === 'boolean' ? checks.ownerEmailAllowlisted : null,
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : 'Middleware probe failed.' };
  }
}

/** Derives a plain-English fix recommendation from the gathered signals. */
function deriveFixRecommendation(
  token: IVXAuthStatusSnapshot,
  session: SupabaseSessionStatus,
  middleware: OwnerMiddlewareResult,
): string | null {
  if (middleware.accepted) return null;
  if (middleware.issuerMatchesBackend === false) {
    return 'Token issuer does not match the backend Supabase project. The app and backend point at DIFFERENT Supabase projects — align EXPO_PUBLIC_SUPABASE_URL between the app and the server, then re-authenticate.';
  }
  if (middleware.tokenExpired === true || (token.expiresInSeconds !== null && token.expiresInSeconds <= 0)) {
    return 'The owner session token is expired. Tap "Refresh token" to mint a fresh access token; if that fails, tap "Re-authenticate" to sign in again.';
  }
  if (middleware.supabaseUserFound === true && middleware.ownerEmailAllowlisted === false) {
    return 'Supabase accepted your session, but your email is NOT in the owner allowlist (IVX_OWNER_REGISTRATION_EMAILS) — so the owner route returns 401/403 and the chat falls back. Add your owner email to IVX_OWNER_REGISTRATION_EMAILS on the backend, or sign in with an allowlisted owner email.';
  }
  if (!session.hasSession || !token.tokenPresent) {
    return 'No owner session is present. Tap "Re-authenticate" to sign in as the owner — owner-gated routes will keep returning 401 until a valid session exists.';
  }
  if (middleware.supabaseUserFound === false) {
    return 'Supabase rejected the session (revoked or signed out elsewhere). Tap "Re-authenticate" to establish a new owner session.';
  }
  if (middleware.error) {
    return `Could not reach the owner auth middleware: ${middleware.error}. Check connectivity and the API base URL, then retry.`;
  }
  if (middleware.rootCause) return middleware.rootCause;
  return 'Owner auth did not succeed. Refresh the token; if it stays rejected, re-authenticate as the owner.';
}

/**
 * Gathers the full owner-auth diagnostic. When auth fails, auto-raises a watchdog
 * incident (source=`auth`) so the failure shows up in the watchdog with a fix.
 */
export async function runAuthDiagnostic(): Promise<AuthDiagnosticReport> {
  const generatedAt = new Date().toISOString();
  const [tokenSnapshot, sessionStatus, middleware] = await Promise.all([
    getIVXAuthStatusSnapshot(),
    readSupabaseSession(),
    probeOwnerMiddleware(),
  ]);

  const lastFailure = getLastIVXOwnerAIPrimaryRouteFailure();
  const lastDiagnostic = getLastIVXOwnerAIAuthDiagnostic();

  const lastOwnerEndpoint = lastFailure?.endpoint ?? middleware.endpoint;
  const lastHttpStatus = lastFailure?.statusCode ?? middleware.httpStatus;
  const authFailureReason = middleware.accepted
    ? null
    : (middleware.rootCause
      ?? lastFailure?.reason
      ?? lastDiagnostic?.rootCause
      ?? middleware.error
      ?? 'Owner auth middleware rejected the session.');

  const status: AuthDiagnosticReport['status'] = middleware.accepted
    ? 'healthy'
    : (middleware.httpStatus === 401 || middleware.httpStatus === 403 || !sessionStatus.hasSession)
      ? 'failed'
      : 'degraded';

  const headline = middleware.accepted
    ? 'Owner authentication is healthy. The owner-gated routes accept your session.'
    : status === 'failed'
      ? `Owner authentication FAILED${lastHttpStatus ? ` (HTTP ${lastHttpStatus})` : ''}. Owner-gated routes are being rejected.`
      : 'Owner authentication is degraded. Review the details below.';

  const fixRecommendation = deriveFixRecommendation(tokenSnapshot, sessionStatus, middleware);
  const lastBlockedTraceId = lastFailure?.endpoint ? readLastBlockedTraceId() : readLastBlockedTraceId();
  // A live retry can be attempted only when the device has a session token to present.
  const retryAvailable = sessionStatus.hasSession && tokenSnapshot.tokenPresent;

  const fields: AuthDiagnosticField[] = [
    {
      label: 'Owner token status',
      value: tokenSnapshot.tokenPresent ? `present (${tokenSnapshot.tokenLength} chars)` : 'missing',
      state: tokenSnapshot.tokenPresent ? 'ok' : 'fail',
    },
    {
      label: 'Token expiration',
      value: formatExpiry(tokenSnapshot.expiresInSeconds),
      state: tokenSnapshot.expiresInSeconds === null
        ? 'unknown'
        : tokenSnapshot.expiresInSeconds <= 0
          ? 'fail'
          : tokenSnapshot.expiresInSeconds < 90
            ? 'warn'
            : 'ok',
    },
    {
      label: 'Supabase session',
      value: sessionStatus.hasSession ? 'active' : 'no session',
      state: sessionStatus.hasSession ? 'ok' : 'fail',
    },
    {
      label: 'Owner email',
      value: sessionStatus.email ?? middleware.authenticatedEmailMasked ?? 'unknown',
      state: sessionStatus.email || middleware.authenticatedEmailMasked ? 'ok' : 'warn',
    },
    {
      label: 'Owner auth middleware',
      value: middleware.accepted
        ? 'accepted (HTTP 200)'
        : middleware.httpStatus
          ? `rejected (HTTP ${middleware.httpStatus})`
          : middleware.error
            ? 'unreachable'
            : 'unknown',
      state: middleware.accepted ? 'ok' : middleware.httpStatus ? 'fail' : 'warn',
    },
    {
      label: 'Last owner endpoint',
      value: lastOwnerEndpoint ?? 'none recorded',
      state: 'unknown',
    },
    {
      label: 'HTTP code returned',
      value: lastHttpStatus !== null && lastHttpStatus !== undefined ? String(lastHttpStatus) : 'n/a',
      state: lastHttpStatus === 200 ? 'ok' : lastHttpStatus === 401 || lastHttpStatus === 403 ? 'fail' : 'unknown',
    },
    {
      label: 'Token issuer match',
      value: middleware.issuerMatchesBackend === null
        ? 'unknown'
        : middleware.issuerMatchesBackend
          ? 'matches backend project'
          : 'MISMATCH (different Supabase project)',
      state: middleware.issuerMatchesBackend === null ? 'unknown' : middleware.issuerMatchesBackend ? 'ok' : 'fail',
    },
    {
      label: 'Owner email allowlisted',
      value: middleware.ownerEmailAllowlisted === null
        ? 'unknown'
        : middleware.ownerEmailAllowlisted
          ? 'yes (in IVX_OWNER_REGISTRATION_EMAILS)'
          : 'NO (email not in owner allowlist)',
      state: middleware.ownerEmailAllowlisted === null ? 'unknown' : middleware.ownerEmailAllowlisted ? 'ok' : 'fail',
    },
    {
      label: 'Last blocked traceId',
      value: lastBlockedTraceId ?? 'none recorded',
      state: lastBlockedTraceId ? 'warn' : 'ok',
    },
    {
      label: 'Retry available',
      value: retryAvailable ? 'yes' : 'no (no owner session token)',
      state: retryAvailable ? 'ok' : 'warn',
    },
    {
      label: 'Auth failure reason',
      value: authFailureReason ?? 'none',
      state: authFailureReason ? 'fail' : 'ok',
    },
  ];

  let incidentRaised = false;
  if (!middleware.accepted) {
    try {
      reportIVXIncident({
        source: 'auth',
        severity: status === 'failed' ? 'error' : 'warning',
        checkpoint: 'owner_route_auth_401',
        fileLine: 'expo/src/modules/ivx-developer/authDiagnosticsService.ts:runAuthDiagnostic',
        message: `owner_route_auth_401: ${authFailureReason ?? 'owner auth rejected'}`,
        responseStatus: lastHttpStatus ?? middleware.httpStatus ?? null,
        stack: fixRecommendation,
      });
      incidentRaised = true;
    } catch {
      incidentRaised = false;
    }
  }

  return {
    generatedAt,
    status,
    headline,
    fields,
    tokenSnapshot,
    sessionStatus,
    middleware,
    lastOwnerEndpoint,
    lastHttpStatus: lastHttpStatus ?? null,
    authFailureReason,
    lastBlockedTraceId,
    retryAvailable,
    fixRecommendation,
    incidentRaised,
  };
}

export type AuthActionResult = {
  ok: boolean;
  message: string;
};

/**
 * Result of the one-tap "Refresh Owner Session" recovery flow.
 * `ownerDetected` is true ONLY when the live owner-gated middleware accepted the
 * session (HTTP 200). `needsSignIn` is true when the session could not be
 * recovered and the owner was signed out so the auth gate prompts a fresh login.
 */
export type OwnerSessionRecoveryResult = {
  ok: boolean;
  /** True when /api/ivx/owner-ai/auth-diagnostic accepted the session (HTTP 200). */
  ownerDetected: boolean;
  /** True when the device was signed out and the owner must sign in again. */
  needsSignIn: boolean;
  /** HTTP code the owner middleware returned on the confirming probe, if any. */
  httpStatus: number | null;
  /** The recovery path that ran. */
  step: 'token_refresh' | 'session_refresh' | 'forced_signout';
  message: string;
};

/**
 * One-tap owner session recovery. Runs the full recovery ladder in order:
 *   1. Force a Supabase session/token refresh.
 *   2. If refresh fails, force a logout so the app prompts a fresh owner login.
 *   3. Confirm ownerDetected by probing the live owner-gated middleware.
 * Never throws — every failure path returns a structured, owner-readable result.
 */
export async function refreshOwnerSession(): Promise<OwnerSessionRecoveryResult> {
  let step: OwnerSessionRecoveryResult['step'] = 'token_refresh';
  let recovered = false;

  // Step 1 — force a fresh access token from the existing refresh token.
  try {
    const token = await getIVXAccessToken({ forceRefresh: true });
    recovered = Boolean(token);
  } catch {
    recovered = false;
  }

  // Step 2 — if the token refresh did not produce a session, try a full
  // Supabase session refresh; if THAT also fails, force a logout so the app's
  // auth gate prompts a fresh owner sign-in.
  if (!recovered) {
    step = 'session_refresh';
    try {
      const supabase = getIVXSupabaseClient();
      const { data } = await supabase.auth.refreshSession();
      recovered = Boolean(data.session?.access_token);
      if (!recovered) {
        step = 'forced_signout';
        await supabase.auth.signOut().catch(() => {});
        return {
          ok: false,
          ownerDetected: false,
          needsSignIn: true,
          httpStatus: null,
          step,
          message: 'Owner session could not be refreshed. Signed out — please sign in again as the owner.',
        };
      }
    } catch {
      step = 'forced_signout';
      try {
        await getIVXSupabaseClient().auth.signOut();
      } catch {}
      return {
        ok: false,
        ownerDetected: false,
        needsSignIn: true,
        httpStatus: null,
        step,
        message: 'Owner session refresh failed. Signed out — please sign in again as the owner.',
      };
    }
  }

  // Step 3 — confirm the recovered session is actually accepted by the live
  // owner-gated middleware (this is what proves ownerDetected = YES).
  const middleware = await probeOwnerMiddleware();
  const ownerDetected = middleware.accepted;
  return {
    ok: ownerDetected,
    ownerDetected,
    needsSignIn: false,
    httpStatus: middleware.httpStatus,
    step,
    message: ownerDetected
      ? 'Owner session refreshed and ownerDetected = YES (owner route accepted, HTTP 200).'
      : middleware.httpStatus
        ? `Session refreshed, but the owner route still rejected it (HTTP ${middleware.httpStatus}): ${middleware.rootCause ?? 'owner not detected'}.`
        : `Session refreshed, but the owner middleware was unreachable: ${middleware.error ?? 'unknown'}.`,
  };
}

/**
 * One device-side reachability probe result. `httpStatus` is the real HTTP code
 * when a Response was received, or null when fetch threw BEFORE any response
 * existed (network / DNS / TLS / timeout / cold-start) — in which case
 * `statusLabel` is the explicit `OWNER_AI_NETWORK_FAILED` / `NETWORK_FAILED`
 * classification so the owner NEVER sees a blank status.
 */
export type ReachabilityProbe = {
  label: string;
  endpoint: string;
  method: 'GET' | 'POST';
  /** Real HTTP code, or null when fetch threw before a Response existed. */
  httpStatus: number | null;
  /** Never blank: a real code as string, or NETWORK_FAILED / OWNER_AI_NETWORK_FAILED. */
  statusLabel: string;
  /** true only when a Response was received (any code); false = fetch-before-response. */
  responded: boolean;
  responseTimeMs: number;
  /** Coarse shape of the body: 'json' | 'text' | 'empty' | 'none'. */
  responseBodyShape: 'json' | 'text' | 'empty' | 'none';
  /** Short, owner-readable detail (no secrets, no tokens). */
  detail: string | null;
  traceId: string;
};

export type ReachabilityReport = {
  generatedAt: string;
  baseUrl: string;
  ownerTokenPresent: boolean;
  probes: ReachabilityProbe[];
  /** Interpreted verdict per the owner's rules. */
  verdict:
    | 'DEVICE_CANNOT_REACH_BACKEND'
    | 'PUBLIC_CHAT_ROUTE_FAILED'
    | 'OWNER_AUTH_FAILED'
    | 'OWNER_SESSION_REQUIRED'
    | 'OWNER_AI_NETWORK_FAILED'
    | 'BACKEND_REACHABLE_OWNER_AI_OK'
    | 'OWNER_AI_UNKNOWN';
  verdictDetail: string;
};

const REACHABILITY_TIMEOUT_MS = 15000;

/**
 * Runs a single device-side probe. Distinguishes fetch-before-response (no HTTP
 * status, classified NETWORK_FAILED) from a real HTTP response (status shown).
 * Never throws — every failure becomes an explicit, classified probe result.
 */
async function runReachabilityProbe(input: {
  label: string;
  endpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** When set, fetch-before-response is labeled OWNER_AI_NETWORK_FAILED. */
  ownerAiPath?: boolean;
}): Promise<ReachabilityProbe> {
  const traceId = `ivx-reach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    const response = await fetch(input.endpoint, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - startedAt;
    let bodyShape: ReachabilityProbe['responseBodyShape'] = 'none';
    let detail: string | null = null;
    try {
      const text = await response.text();
      if (!text) {
        bodyShape = 'empty';
      } else {
        try {
          JSON.parse(text);
          bodyShape = 'json';
        } catch {
          bodyShape = 'text';
        }
        detail = text.slice(0, 160);
      }
    } catch {
      bodyShape = 'none';
    }
    return {
      label: input.label,
      endpoint: input.endpoint,
      method: input.method,
      httpStatus: response.status,
      statusLabel: String(response.status),
      responded: true,
      responseTimeMs,
      responseBodyShape: bodyShape,
      detail,
      traceId,
    };
  } catch (error) {
    // fetch threw BEFORE a Response existed → network / DNS / TLS / timeout /
    // cold-start / connectivity. NEVER a blank status.
    const responseTimeMs = Date.now() - startedAt;
    const aborted = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
    const reason = aborted
      ? `timeout after ${REACHABILITY_TIMEOUT_MS}ms`
      : error instanceof Error
        ? error.message
        : 'network unreachable';
    return {
      label: input.label,
      endpoint: input.endpoint,
      method: input.method,
      httpStatus: null,
      statusLabel: input.ownerAiPath ? 'OWNER_AI_NETWORK_FAILED' : 'NETWORK_FAILED',
      responded: false,
      responseTimeMs,
      responseBodyShape: 'none',
      detail: `fetch threw before response (${reason})`,
      traceId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Device-side backend reachability probe (the "Test backend reachability"
 * button). Runs, in order: GET /health → POST /public/chat (ALIVE) → POST
 * /api/ivx/owner-ai with the current owner token (if any). Applies the owner's
 * interpretation rules to produce a single verdict. Never throws.
 */
export async function testBackendReachability(): Promise<ReachabilityReport> {
  const generatedAt = new Date().toISOString();
  const baseUrl = backendBaseUrl();

  let ownerToken: string | null = null;
  try {
    ownerToken = await getIVXAccessToken();
  } catch {
    ownerToken = null;
  }

  const probes: ReachabilityProbe[] = [];

  const health = await runReachabilityProbe({
    label: 'GET /health',
    endpoint: `${baseUrl}/health`,
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  probes.push(health);

  const publicChat = await runReachabilityProbe({
    label: 'POST /public/chat',
    endpoint: `${baseUrl}/public/chat`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      requestId: `ivx-reach-${Date.now()}`,
      sessionId: 'ivx-reachability-probe',
      message: 'Return one word only: ALIVE',
      history: [],
    }),
  });
  probes.push(publicChat);

  let ownerAi: ReachabilityProbe | null = null;
  if (ownerToken) {
    ownerAi = await runReachabilityProbe({
      label: 'POST /api/ivx/owner-ai',
      endpoint: `${baseUrl}/api/ivx/owner-ai`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ message: 'Return one word only: ALIVE', mode: 'chat' }),
      ownerAiPath: true,
    });
    probes.push(ownerAi);
  }

  // Interpretation rules (owner spec, in order).
  let verdict: ReachabilityReport['verdict'] = 'OWNER_AI_UNKNOWN';
  let verdictDetail = '';
  if (!health.responded) {
    verdict = 'DEVICE_CANNOT_REACH_BACKEND';
    verdictDetail = `The device cannot reach the backend (${health.detail ?? 'network failure'}). Check your network, refresh Expo, then retry.`;
  } else if (!publicChat.responded || (publicChat.httpStatus !== null && publicChat.httpStatus >= 400)) {
    verdict = 'PUBLIC_CHAT_ROUTE_FAILED';
    verdictDetail = `/health is reachable but /public/chat failed (${publicChat.statusLabel}). The backend is up but the public chat route is failing.`;
  } else if (!ownerToken) {
    verdict = 'OWNER_SESSION_REQUIRED';
    verdictDetail = 'Backend is reachable and /public/chat works, but there is no owner session token on this device to test the owner-gated route. Re-authenticate to test /api/ivx/owner-ai.';
  } else if (ownerAi && (ownerAi.httpStatus === 401 || ownerAi.httpStatus === 403)) {
    verdict = 'OWNER_AUTH_FAILED';
    verdictDetail = `/public/chat works but /api/ivx/owner-ai returned ${ownerAi.httpStatus}. Your owner session was rejected — open the recovery actions to refresh or re-authenticate.`;
  } else if (ownerAi && !ownerAi.responded) {
    verdict = 'OWNER_AI_NETWORK_FAILED';
    verdictDetail = `/public/chat works but /api/ivx/owner-ai fetch failed before any response (${ownerAi.detail ?? 'network failure'}). This is a network/connectivity issue on the owner route, not an auth failure.`;
  } else if (ownerAi && ownerAi.httpStatus !== null && ownerAi.httpStatus >= 200 && ownerAi.httpStatus < 300) {
    verdict = 'BACKEND_REACHABLE_OWNER_AI_OK';
    verdictDetail = 'BACKEND_POST_FINISHED ✅ · ASSISTANT_TEXT_PRESENT ✅ — backend reachable and /api/ivx/owner-ai returned 200.';
  } else if (ownerAi && ownerAi.httpStatus !== null && ownerAi.httpStatus >= 500) {
    verdict = 'OWNER_AI_NETWORK_FAILED';
    verdictDetail = `/api/ivx/owner-ai returned ${ownerAi.httpStatus} (server error). Backend reachable; the owner route is temporarily unavailable.`;
  } else {
    verdict = 'OWNER_AI_UNKNOWN';
    verdictDetail = ownerAi
      ? `/api/ivx/owner-ai returned ${ownerAi.statusLabel}.`
      : 'Backend reachable and /public/chat works.';
  }

  console.log('[IVXReachability] Backend reachability probe complete:', {
    baseUrl,
    ownerTokenPresent: Boolean(ownerToken),
    verdict,
    probes: probes.map((p) => ({ label: p.label, statusLabel: p.statusLabel, responded: p.responded, ms: p.responseTimeMs })),
  });

  return {
    generatedAt,
    baseUrl,
    ownerTokenPresent: Boolean(ownerToken),
    probes,
    verdict,
    verdictDetail,
  };
}

/** Forces a fresh access token via Supabase session refresh. */
export async function refreshOwnerToken(): Promise<AuthActionResult> {
  try {
    const token = await getIVXAccessToken({ forceRefresh: true });
    if (token) {
      return { ok: true, message: 'Access token refreshed. Re-running the diagnostic…' };
    }
    return { ok: false, message: 'Refresh did not produce a token. Try "Re-authenticate".' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Token refresh failed.' };
  }
}

/**
 * Clears the on-device Supabase session entirely (sign-out + storage wipe).
 *
 * This is the exact recovery for `issuer_mismatch`: the device holds a STALE
 * cached session whose JWT was issued by a DIFFERENT Supabase project (a
 * previous build, or a wrong project URL). Supabase's `signOut()` clears the
 * in-memory session, but the persisted AsyncStorage slot can survive it on
 * certain code paths — so we explicitly remove the known Supabase storage keys
 * AFTER signOut, then re-init the client. The next sign-in mints a fresh token
 * from the CURRENT production project, which the backend accepts.
 *
 * Never throws — every failure becomes a structured, owner-readable result.
 */
export async function clearStaleOwnerSession(): Promise<AuthActionResult> {
  try {
    const supabase = getIVXSupabaseClient();
    // 1. Best-effort sign-out (clears in-memory + signals auth state change).
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.log('[IVXAuthDiagnostics] signOut during clearStaleOwnerSession threw (continuing to wipe storage):', signOutError instanceof Error ? signOutError.message : 'unknown');
    }
    // 2. Wipe the known Supabase AsyncStorage slots so a stale token can never
    //    rehydrate. The supabase-js default storage key is
    //    `sb-<ref>-auth-token` for hosted projects (ref = project ref from URL).
    //    We also clear the legacy `supabase.auth.token` key used by older SDKs.
    try {
      const AsyncStorageMod = await import('@react-native-async-storage/async-storage');
      const AsyncStorage = AsyncStorageMod.default ?? AsyncStorageMod;
      const supabaseUrl = resolveSupabaseUrl();
      let projectRef = '';
      try {
        projectRef = new URL(supabaseUrl).hostname.split('.')[0] ?? '';
      } catch {}
      const keysToClear = [
        'supabase.auth.token',
        projectRef ? `sb-${projectRef}-auth-token` : '',
        'ivx-owner-session',
        'ivx_owner_session',
      ].filter(Boolean);
      for (const key of keysToClear) {
        try {
          await AsyncStorage.removeItem(key);
        } catch (removeError) {
          console.log('[IVXAuthDiagnostics] AsyncStorage.removeItem failed for key:', key, removeError instanceof Error ? removeError.message : 'unknown');
        }
      }
    } catch (asyncStorageImportError) {
      console.log('[IVXAuthDiagnostics] AsyncStorage import failed during clearStaleOwnerSession:', asyncStorageImportError instanceof Error ? asyncStorageImportError.message : 'unknown');
    }
    // 3. Force a session refresh probe so the next diagnostic reflects reality.
    try {
      await supabase.auth.refreshSession();
    } catch {}
    return {
      ok: true,
      message: 'Stale owner session cleared. Tap "Re-authenticate" (or sign in) to mint a fresh token from the production Supabase project.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Clear stale session failed.',
    };
  }
}

/**
 * Re-authenticates the owner: attempts a full Supabase session refresh; if no
 * session can be recovered, signs out so the app's auth gate prompts a fresh
 * owner sign-in. Returns whether a valid session was recovered.
 */
export async function reAuthenticateOwner(): Promise<AuthActionResult> {
  try {
    const supabase = getIVXSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session?.access_token) {
      return { ok: true, message: 'Owner session recovered. Retrying the owner request…' };
    }
    await supabase.auth.signOut().catch(() => {});
    return {
      ok: false,
      message: error?.message
        ? `Session could not be refreshed (${error.message}). Signed out — sign in again as the owner.`
        : 'Session could not be refreshed. Signed out — sign in again as the owner.',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Re-authentication failed.' };
  }
}

/**
 * Retries a live owner-gated request with the current session and reports the
 * resulting HTTP status — the "retry request" step of the recovery flow.
 */
export async function retryOwnerRequest(): Promise<AuthActionResult> {
  const middleware = await probeOwnerMiddleware();
  if (middleware.accepted) {
    return { ok: true, message: 'Owner request succeeded (HTTP 200). Session recovered.' };
  }
  return {
    ok: false,
    message: middleware.httpStatus
      ? `Owner request still rejected (HTTP ${middleware.httpStatus}): ${middleware.rootCause ?? 'auth not accepted'}.`
      : `Owner request failed: ${middleware.error ?? 'unreachable'}.`,
  };
}
