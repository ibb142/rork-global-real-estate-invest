/**
 * Senior Developer run preflight (owner-only).
 *
 * Confirms the right owner sign-in is in place BEFORE a Senior Developer
 * production task is allowed to reach the backend. This prevents the request
 * from bouncing off the server's owner-bearer gate with a generic 401 — instead
 * the owner sees a precise, non-secret reason up front.
 *
 * SECURITY: this never prints, returns, or logs the token value. It only reports
 * structural facts (present / segment count / looks-like-JWT) and email allowlist
 * membership. It does NOT weaken the server guard and never uses the hex
 * IVX_OWNER_TOKEN for code mutation, commit, or deploy.
 */

import { getIVXOwnerEmailAllowlist } from '@/shared/ivx/access-control';

/** Non-secret, owner-readable preflight facts. NEVER contains the token value. */
export type SeniorDeveloperPreflight = {
  ownerSessionPresent: boolean;
  tokenPresent: boolean;
  tokenSegmentCount: number;
  tokenLooksLikeSupabaseJwt: boolean;
  userEmailPresent: boolean;
  ownerEmailAllowlisted: boolean;
  readyToRun: boolean;
  /** Precise reason the run is blocked, or null when readyToRun is true. */
  blockReason: string | null;
};

export type SeniorDeveloperPreflightInput = {
  /** The logged-in Supabase session access token, or null when no session. */
  accessToken: string | null;
  /** The signed-in user's email, or null. */
  userEmail: string | null;
  /** Configured owner allowlist emails (client-visible, e.g. EXPO_PUBLIC_OWNER_EMAIL). */
  ownerAllowlist: readonly string[];
};

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Pure evaluation of preflight readiness. Deterministic and token-value-free:
 * the returned object intentionally omits the raw token so it is always safe to
 * render, log, or serialize.
 */
export function evaluateSeniorDeveloperPreflight(
  input: SeniorDeveloperPreflightInput,
): SeniorDeveloperPreflight {
  const token = (input.accessToken ?? '').trim();
  const tokenPresent = token.length > 0;
  const segments = tokenPresent ? token.split('.') : [];
  const tokenSegmentCount = tokenPresent ? segments.length : 0;
  const tokenLooksLikeSupabaseJwt =
    tokenSegmentCount === 3 && segments.every((part) => part.length > 0);

  const ownerSessionPresent = tokenPresent;
  const normalizedUserEmail = normalizeEmail(input.userEmail);
  const userEmailPresent = normalizedUserEmail.length > 0;
  const allowlist = input.ownerAllowlist.map(normalizeEmail).filter(Boolean);
  const ownerEmailAllowlisted =
    userEmailPresent && (allowlist.length === 0 || allowlist.includes(normalizedUserEmail));

  let blockReason: string | null = null;
  if (!ownerSessionPresent) {
    blockReason = 'No owner session detected. Sign in as the IVX owner before running a Senior Developer task.';
  } else if (!tokenLooksLikeSupabaseJwt) {
    blockReason = `Session token is not a valid owner session token (expected 3 parts, found ${tokenSegmentCount}). Re-authenticate as the owner.`;
  } else if (!userEmailPresent) {
    blockReason = 'Signed-in owner email is missing from the session. Re-authenticate as the owner.';
  } else if (!ownerEmailAllowlisted) {
    blockReason = 'Signed-in email is not on the owner allow-list. Sign in with an allowlisted owner email.';
  }

  return {
    ownerSessionPresent,
    tokenPresent,
    tokenSegmentCount,
    tokenLooksLikeSupabaseJwt,
    userEmailPresent,
    ownerEmailAllowlisted,
    readyToRun: blockReason === null,
    blockReason,
  };
}

/**
 * Owner-proof gate status codes surfaced to the owner in Expo Go / dev runtime.
 * These are stable string codes the UI (and the owner) can read directly.
 */
export type OwnerProofGateStatus =
  | 'OWNER_LOGIN_REQUIRED'
  | 'OWNER_EMAIL_NOT_ALLOWED'
  | 'OWNER_SESSION_INVALID'
  | 'OWNER_PROOF_READY';

/** Exact login screen the owner must open to obtain a valid owner session. */
export const OWNER_LOGIN_PATH = '/login?ownerMode=1' as const;

/** Non-secret owner-proof gate result. NEVER contains the token or email value. */
export type OwnerProofGate = {
  status: OwnerProofGateStatus;
  /** True only when an allowlisted owner with a valid session may run the proof. */
  accessGranted: boolean;
  /** Exact login route to open when a sign-in is required, else null. */
  loginPath: string | null;
  /** Precise non-secret reason, or null when access is granted. */
  reason: string | null;
  /** Underlying preflight facts (token-value-free). */
  preflight: SeniorDeveloperPreflight;
};

/**
 * Maps the pure preflight facts to an owner-proof gate decision with stable
 * status codes. Pure and token-value-free, so it is always safe to render/log.
 */
export function evaluateOwnerProofGate(
  input: SeniorDeveloperPreflightInput,
): OwnerProofGate {
  const preflight = evaluateSeniorDeveloperPreflight(input);

  if (!preflight.ownerSessionPresent) {
    return {
      status: 'OWNER_LOGIN_REQUIRED',
      accessGranted: false,
      loginPath: OWNER_LOGIN_PATH,
      reason: 'No owner session detected. Sign in as the IVX owner to run the build-marker proof.',
      preflight,
    };
  }
  if (!preflight.tokenLooksLikeSupabaseJwt) {
    return {
      status: 'OWNER_SESSION_INVALID',
      accessGranted: false,
      loginPath: OWNER_LOGIN_PATH,
      reason: `Session is not a valid owner session token (expected 3 parts, found ${preflight.tokenSegmentCount}). Re-authenticate as the owner.`,
      preflight,
    };
  }
  if (!preflight.userEmailPresent) {
    return {
      status: 'OWNER_SESSION_INVALID',
      accessGranted: false,
      loginPath: OWNER_LOGIN_PATH,
      reason: 'Signed-in owner email is missing from the session. Re-authenticate as the owner.',
      preflight,
    };
  }
  if (!preflight.ownerEmailAllowlisted) {
    return {
      status: 'OWNER_EMAIL_NOT_ALLOWED',
      accessGranted: false,
      loginPath: OWNER_LOGIN_PATH,
      reason: 'Signed-in email is not on the owner allow-list. Sign in with the configured owner email.',
      preflight,
    };
  }

  return {
    status: 'OWNER_PROOF_READY',
    accessGranted: true,
    loginPath: null,
    reason: null,
    preflight,
  };
}

/** Reads the client-visible owner allowlist from the pinned baseline + env. */
export function getClientOwnerAllowlist(): string[] {
  return getIVXOwnerEmailAllowlist();
}

/**
 * Live preflight: reads the current Supabase session WITHOUT exposing the token
 * and evaluates readiness. Never throws — a failed session read degrades to a
 * blocked, not-signed-in result.
 */
export async function gatherSeniorDeveloperPreflight(): Promise<SeniorDeveloperPreflight> {
  return (await gatherOwnerProofGate()).preflight;
}

/**
 * Live owner-proof gate: reads the current Supabase session WITHOUT exposing the
 * token and returns a stable gate decision (status code + login path). Never
 * throws — a failed session read degrades to OWNER_LOGIN_REQUIRED.
 */
export async function gatherOwnerProofGate(): Promise<OwnerProofGate> {
  try {
    // Lazy import so the pure evaluator stays unit-testable without the native
    // Supabase module being resolvable in the test environment.
    const { supabase } = await import('@/lib/supabase');
    let { data } = await supabase.auth.getSession();
    let session = data.session;
    let userEmail = session?.user?.email ?? null;

    // OWNER AUTO-LOGIN BLOCK: restoreOwnerResilientSession() removed.
    // The owner must manually sign in every time — no automatic session
    // restore from SecureStore. If the live session is missing, the
    // preflight will report no owner session and prompt manual sign-in.

    return evaluateOwnerProofGate({
      accessToken: session?.access_token ?? null,
      userEmail,
      ownerAllowlist: getClientOwnerAllowlist(),
    });
  } catch {
    return evaluateOwnerProofGate({
      accessToken: null,
      userEmail: null,
      ownerAllowlist: getClientOwnerAllowlist(),
    });
  }
}
