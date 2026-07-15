import { normalizeRole } from '@/lib/auth-helpers';
import { getConfiguredOwnerAdminEmail, isOwnerAdminEmail } from '@/lib/admin-access-lock';
import { isOpenAccessModeEnabled } from '@/lib/open-access';

/**
 * Minimal shape of an authenticated user needed to evaluate owner access.
 * Matches what `useAuth()` exposes plus optional fields some screens carry.
 */
export interface OwnerAccessUser {
  id?: string | null;
  email?: string | null;
  role?: string | null;
}

/**
 * Minimal shape of a profile that can grant owner access. Any of `role: "owner"`,
 * `isOwner`, or `ownerAccess` flips access on.
 */
export interface OwnerAccessProfile {
  role?: string | null;
  isOwner?: boolean | null;
  ownerAccess?: boolean | null;
}

export interface OwnerAccessResult {
  allowed: boolean;
  /** Human-readable reason when access is denied; `null` when allowed. */
  reason: string | null;
}

/**
 * Debug-safe, secret-free snapshot of every input that decides owner access.
 * Safe to render in a status panel or log — contains no emails, tokens, or
 * secrets, only booleans plus a human-readable failure reason.
 */
export interface OwnerStatus {
  /** Auth hydration finished (session restore + role resolution settled). */
  authLoaded: boolean;
  /** A user/session object is present. */
  sessionPresent: boolean;
  /** The session carries an email. */
  userEmailPresent: boolean;
  /** An owner email is configured in this build (EXPO_PUBLIC_OWNER_EMAIL). */
  ownerEmailConfigured: boolean;
  /** The session email matches the configured owner email (case/space-insensitive). */
  ownerEmailMatch: boolean;
  /** The profile/user role (or owner flags) grant owner access. */
  ownerRoleFromProfile: boolean;
  /** Final decision: owner controls should be shown. */
  ownerAccessGranted: boolean;
  /**
   * Why access is not granted yet. `null` when granted OR while auth is still
   * hydrating — callers must use `authLoaded` to decide whether to show a
   * loading state instead of a denial. Owner controls must never be hidden
   * with a failure reason before `authLoaded` is true.
   */
  failureReason: string | null;
}

/**
 * Inputs to {@link resolveOwnerStatus}. `authLoaded` lets the UI tell apart
 * "still verifying" from "verified and denied" so owner controls are never
 * hidden mid-hydration.
 */
export interface OwnerStatusInput {
  authLoaded: boolean;
  user: OwnerAccessUser | null | undefined;
  profile: OwnerAccessProfile | null | undefined;
}

function hasOwnerRole(
  user: OwnerAccessUser | null | undefined,
  profile: OwnerAccessProfile | null | undefined,
): boolean {
  const role = normalizeRole(profile?.role ?? user?.role);
  return role === 'owner' || profile?.isOwner === true || profile?.ownerAccess === true;
}

/**
 * THE single source of truth for owner access across the app. Every owner-only
 * surface (Profile administration, Admin Panel guard, OwnerOnly gate) derives
 * from this so there is exactly one owner-access decision, never duplicated
 * per-screen booleans that drift out of sync.
 *
 * Owner access is granted when any of these hold:
 * - open-access build mode is enabled (login bypassed in this build)
 * - the session email matches the configured owner email (survives a missing
 *   profile row / role-after-token-refresh, and is case/space-insensitive)
 * - the profile/user role normalizes to `owner`, or an `isOwner`/`ownerAccess`
 *   flag is set
 */
export function resolveOwnerStatus(input: OwnerStatusInput): OwnerStatus {
  const { authLoaded, user, profile } = input;
  const openAccess = isOpenAccessModeEnabled();

  const sessionPresent = !!user;
  const userEmailPresent = !!user?.email;
  const ownerEmailConfigured = !!getConfiguredOwnerAdminEmail();
  const ownerEmailMatch = isOwnerAdminEmail(user?.email);
  const ownerRoleFromProfile = hasOwnerRole(user, profile);

  const ownerAccessGranted = openAccess || ownerEmailMatch || ownerRoleFromProfile;

  let failureReason: string | null = null;
  if (!ownerAccessGranted) {
    if (!authLoaded) {
      // Still hydrating — do NOT surface a denial yet. Callers show a loading
      // state based on `authLoaded`.
      failureReason = null;
    } else if (!sessionPresent) {
      failureReason = 'Not logged in. Open Owner Login to continue.';
    } else if (!userEmailPresent) {
      failureReason = 'Signed in but no email is attached to this session.';
    } else if (!ownerEmailConfigured) {
      failureReason = 'No owner email is configured for this build (EXPO_PUBLIC_OWNER_EMAIL is empty).';
    } else if (!ownerEmailMatch) {
      failureReason = 'This account is not the configured owner email and has no owner role.';
    } else {
      failureReason = 'Owner privileges required';
    }
  }

  return {
    authLoaded,
    sessionPresent,
    userEmailPresent,
    ownerEmailConfigured,
    ownerEmailMatch,
    ownerRoleFromProfile,
    ownerAccessGranted,
    failureReason,
  };
}

/**
 * Single source of truth for "is this user an owner?" used by owner-only screens.
 * Thin wrapper over {@link resolveOwnerStatus} that returns the allow/reason pair.
 * Treats the input as already-hydrated (auth check complete).
 */
export function checkOwnerAccess(
  user: OwnerAccessUser | null | undefined,
  profile: OwnerAccessProfile | null | undefined,
): OwnerAccessResult {
  const status = resolveOwnerStatus({ authLoaded: true, user, profile });

  return {
    allowed: status.ownerAccessGranted,
    reason: status.ownerAccessGranted ? null : status.failureReason ?? 'Owner privileges required',
  };
}
