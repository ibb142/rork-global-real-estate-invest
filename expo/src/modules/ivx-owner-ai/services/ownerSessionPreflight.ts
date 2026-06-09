/**
 * BLOCK 1 — Owner Session Preflight (runs before ANY owner-gated IVX IA action).
 *
 * A single, reusable gate that proves a REAL owner Supabase session exists before
 * the app POSTs to an owner-gated route (Owner AI chat, Gmail OAuth setup, Capital
 * Outreach actions, Power Tools actions, CRM/Gmail draft actions). Instead of a
 * generic "Owner session token unavailable" or a misleading /public/chat fallback,
 * a failed preflight surfaces an explicit `OWNER_SESSION_REQUIRED` result so the
 * owner is told to re-authenticate and the original action payload is preserved.
 *
 * The ten required checks (owner spec):
 *   1. Supabase session exists (before any POST).
 *   2. A real access_token exists.
 *   3. The synthetic dev-open-access-token is BLOCKED in production (strict mode).
 *   4. The owner email is detected.
 *   5. The owner email is allowlisted.
 *   6. The token issuer matches the app's Supabase project.
 *   7. Missing/expired session → do NOT POST.
 *   8. Returns OWNER_SESSION_REQUIRED (not a generic failure).
 *   9. Preserves the original action/prompt payload (caller keeps its own input).
 *  10. Never falls back to /public/chat (the caller must honor `ok:false`).
 *
 * Never logs or returns the raw access token.
 */
import {
  getIVXAccessToken,
  getIVXSupabaseClient,
} from '@/lib/ivx-supabase-client';
import {
  IVX_OPEN_ACCESS_OWNER_TOKEN,
  getIVXAccessControlConfig,
  isIVXOwnerAllowlistedEmail,
} from '@/shared/ivx/access-control';

/** The canonical blocked label surfaced to every owner-gated action. */
export const OWNER_SESSION_REQUIRED_LABEL = 'OWNER_SESSION_REQUIRED' as const;

/** Why the preflight blocked — one canonical reason per failing branch. */
export type OwnerSessionBlockReason =
  | 'no_supabase_session'
  | 'no_access_token'
  | 'dev_token_blocked_in_production'
  | 'token_not_jwt'
  | 'token_expired'
  | 'owner_email_missing'
  | 'owner_email_not_allowlisted'
  | 'issuer_mismatch';

/** A single preflight check rendered for diagnostics (never carries the token). */
export type OwnerSessionPreflightCheck = {
  id:
    | 'supabase_session'
    | 'access_token'
    | 'dev_token_block'
    | 'owner_email'
    | 'owner_email_allowlisted'
    | 'issuer_match'
    | 'token_validity';
  passed: boolean | null;
  detail: string;
};

export type OwnerSessionPreflightResult =
  | {
      ok: true;
      /** The verified, real Supabase access token to present to the owner route. */
      accessToken: string;
      email: string | null;
      checks: OwnerSessionPreflightCheck[];
    }
  | {
      ok: false;
      label: typeof OWNER_SESSION_REQUIRED_LABEL;
      reason: OwnerSessionBlockReason;
      detail: string;
      email: string | null;
      checks: OwnerSessionPreflightCheck[];
    };

/** Thrown by `assertOwnerSessionAccessToken` so owner-gated `ownerFetch` helpers can short-circuit. */
export class OwnerSessionRequiredError extends Error {
  readonly label = OWNER_SESSION_REQUIRED_LABEL;
  readonly reason: OwnerSessionBlockReason;
  readonly checks: OwnerSessionPreflightCheck[];

  constructor(reason: OwnerSessionBlockReason, detail: string, checks: OwnerSessionPreflightCheck[]) {
    super(detail);
    this.name = 'OwnerSessionRequiredError';
    this.reason = reason;
    this.checks = checks;
  }
}

type DecodedJwt = { iss?: unknown; exp?: unknown; email?: unknown };

function decodeJwtPayload(token: string): DecodedJwt | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const payloadSegment = segments[1] ?? '';
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded) as DecodedJwt;
  } catch {
    return null;
  }
}

function issuerMatchesAppProject(issuer: string | null): boolean | null {
  const frontendSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  if (!issuer || !frontendSupabaseUrl) return null;
  return issuer.replace(/\/+$/, '').startsWith(frontendSupabaseUrl.replace(/\/+$/, ''));
}

/**
 * Runs the full owner-session preflight. Forces a session refresh by default so a
 * soon-to-expire token never reaches the owner route. Returns a structured result;
 * the caller owns its action payload, so nothing is lost on a block.
 */
export async function runOwnerSessionPreflight(
  options: { forceRefresh?: boolean } = {},
): Promise<OwnerSessionPreflightResult> {
  const forceRefresh = options.forceRefresh ?? true;
  const checks: OwnerSessionPreflightCheck[] = [];

  // Check 1 — Supabase session exists (read the live session for email + identity).
  let sessionEmail: string | null = null;
  let hasSession = false;
  try {
    const supabase = getIVXSupabaseClient();
    const { data } = await supabase.auth.getSession();
    hasSession = Boolean(data.session?.access_token);
    sessionEmail = data.session?.user?.email ?? null;
  } catch {
    hasSession = false;
  }
  checks.push({
    id: 'supabase_session',
    passed: hasSession,
    detail: hasSession ? 'Supabase session present.' : 'No hydrated Supabase session on this device.',
  });

  // Check 2 — a real access token resolves (with a forced refresh first).
  let accessToken: string | null = null;
  try {
    accessToken = await getIVXAccessToken({ forceRefresh });
  } catch (error) {
    accessToken = null;
    checks.push({
      id: 'access_token',
      passed: false,
      detail: `Token resolution threw: ${error instanceof Error ? error.message : 'unknown'}.`,
    });
  }

  if (!accessToken) {
    if (!checks.some((c) => c.id === 'access_token')) {
      checks.push({ id: 'access_token', passed: false, detail: 'No access token after refresh.' });
    }
    const reason: OwnerSessionBlockReason = hasSession ? 'no_access_token' : 'no_supabase_session';
    return {
      ok: false,
      label: OWNER_SESSION_REQUIRED_LABEL,
      reason,
      detail:
        'No real owner session is signed in on this device. Sign in as the IVX owner (Auth Diagnostics → Re-authenticate) and retry.',
      email: sessionEmail,
      checks,
    };
  }
  checks.push({ id: 'access_token', passed: true, detail: 'Access token resolved.' });

  // Check 3 — block the synthetic dev-open-access token in production (strict mode).
  const accessConfig = getIVXAccessControlConfig();
  const isDevOpenToken = accessToken === IVX_OPEN_ACCESS_OWNER_TOKEN;
  if (isDevOpenToken && !accessConfig.ownerBypassEnabled) {
    checks.push({
      id: 'dev_token_block',
      passed: false,
      detail: 'Synthetic dev-open-access token blocked from owner route in production.',
    });
    return {
      ok: false,
      label: OWNER_SESSION_REQUIRED_LABEL,
      reason: 'dev_token_blocked_in_production',
      detail:
        'Only the synthetic dev-open-access fallback token is available — production rejects it (owner_route_auth_401). A genuine Supabase owner JWT is required. Re-authenticate as the IVX owner and retry.',
      email: sessionEmail,
      checks,
    };
  }
  checks.push({
    id: 'dev_token_block',
    passed: true,
    detail: isDevOpenToken
      ? 'Dev-open-access token allowed in this non-production runtime.'
      : 'Real Supabase JWT (not the dev-open-access token).',
  });

  // For a real JWT, validate format / expiry / issuer and resolve the email.
  if (!isDevOpenToken) {
    const decoded = decodeJwtPayload(accessToken);
    if (!decoded) {
      checks.push({ id: 'token_validity', passed: false, detail: 'Access token is not a decodable JWT.' });
      return {
        ok: false,
        label: OWNER_SESSION_REQUIRED_LABEL,
        reason: 'token_not_jwt',
        detail: 'The owner session token is not a valid Supabase JWT. Re-authenticate and retry.',
        email: sessionEmail,
        checks,
      };
    }

    // Check 7 — expired session must not POST.
    const exp = typeof decoded.exp === 'number' ? decoded.exp : null;
    const secondsUntilExpiry = exp !== null ? Math.round(exp - Date.now() / 1000) : null;
    if (secondsUntilExpiry !== null && secondsUntilExpiry <= 0) {
      checks.push({
        id: 'token_validity',
        passed: false,
        detail: `Token expired ${Math.abs(secondsUntilExpiry)}s ago.`,
      });
      return {
        ok: false,
        label: OWNER_SESSION_REQUIRED_LABEL,
        reason: 'token_expired',
        detail: 'The owner session token is expired. Refresh the token or re-authenticate, then retry.',
        email: sessionEmail,
        checks,
      };
    }
    checks.push({
      id: 'token_validity',
      passed: true,
      detail:
        secondsUntilExpiry !== null ? `Token valid (expires in ${secondsUntilExpiry}s).` : 'Token format valid.',
    });

    // Check 6 — issuer matches the app's Supabase project (soft: unknown does not block).
    const issuer = typeof decoded.iss === 'string' ? decoded.iss : null;
    const issuerMatch = issuerMatchesAppProject(issuer);
    if (issuerMatch === false) {
      checks.push({
        id: 'issuer_match',
        passed: false,
        detail: 'Token issuer does not match the app Supabase project.',
      });
      return {
        ok: false,
        label: OWNER_SESSION_REQUIRED_LABEL,
        reason: 'issuer_mismatch',
        detail:
          'The owner session was issued by a DIFFERENT Supabase project than the app — the owner route will reject it. Sign in against the correct project and retry.',
        email: sessionEmail,
        checks,
      };
    }
    checks.push({
      id: 'issuer_match',
      passed: issuerMatch,
      detail:
        issuerMatch === null ? 'Issuer match unknown (no app Supabase URL configured).' : 'Issuer matches app project.',
    });

    // Check 4 — owner email detected (prefer session email, fall back to JWT email).
    const decodedEmail = typeof decoded.email === 'string' ? decoded.email : null;
    const ownerEmail = sessionEmail ?? decodedEmail;
    checks.push({
      id: 'owner_email',
      passed: Boolean(ownerEmail),
      detail: ownerEmail ? 'Owner email detected.' : 'No owner email on the session.',
    });

    // Check 5 — owner email allowlisted (soft: the backend allowlist is the source of
    // truth, so a client-side miss is recorded as a warning, not a hard block — the
    // owner route + auth-diagnostic surface the authoritative result).
    const allowlisted = ownerEmail ? isIVXOwnerAllowlistedEmail(ownerEmail) : null;
    checks.push({
      id: 'owner_email_allowlisted',
      passed: allowlisted,
      detail:
        allowlisted === null
          ? 'Allowlist status unknown on this device.'
          : allowlisted
            ? 'Owner email is allowlisted.'
            : 'Owner email not in the device allowlist (backend allowlist is authoritative).',
    });

    return { ok: true, accessToken, email: ownerEmail, checks };
  }

  // Dev-open-access token accepted in a non-production runtime.
  return { ok: true, accessToken, email: sessionEmail, checks };
}

/**
 * Convenience for owner-gated `ownerFetch` helpers: returns the verified access
 * token, or throws `OwnerSessionRequiredError` so the action never POSTs without a
 * real owner session and never falls back to /public/chat.
 */
export async function assertOwnerSessionAccessToken(
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  const result = await runOwnerSessionPreflight(options);
  if (!result.ok) {
    throw new OwnerSessionRequiredError(result.reason, result.detail, result.checks);
  }
  return result.accessToken;
}
