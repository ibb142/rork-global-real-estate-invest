import { isAdminRole, normalizeRole, sanitizeEmail } from '@/lib/auth-helpers';
import { getOpenAccessModeAdminMessage, isOpenAccessModeEnabled } from '@/lib/open-access';

const OWNER_ADMIN_EMAIL = sanitizeEmail(
  process.env.EXPO_PUBLIC_OWNER_EMAIL
    || process.env.NEXT_PUBLIC_OWNER_EMAIL
    || ''
);

export const ADMIN_ACCESS_LOCK_TITLE = isOpenAccessModeEnabled()
  ? 'Open access active'
  : OWNER_ADMIN_EMAIL
    ? 'Owner-only admin access'
    : 'Admin access restored';

export function getConfiguredOwnerAdminEmail(): string | null {
  return OWNER_ADMIN_EMAIL || null;
}

export function isAdminAccessLocked(): boolean {
  return !isOpenAccessModeEnabled() && OWNER_ADMIN_EMAIL.length > 0;
}

export function isOwnerAdminEmail(email: string | null | undefined): boolean {
  if (!OWNER_ADMIN_EMAIL) {
    return false;
  }

  return sanitizeEmail(email ?? '') === OWNER_ADMIN_EMAIL;
}

export function shouldBlockRoleForAdminAccess(role: string | null | undefined, email?: string | null): boolean {
  if (isOpenAccessModeEnabled()) {
    return false;
  }

  return isAdminAccessLocked() && isAdminRole(normalizeRole(role)) && !isOwnerAdminEmail(email);
}

export function getAdminAccessLockMessage(): string {
  if (isOpenAccessModeEnabled()) {
    return getOpenAccessModeAdminMessage();
  }

  if (!OWNER_ADMIN_EMAIL) {
    return 'The temporary app-side admin lock is off. Owner/admin sign-in, trusted-device restore, and admin routes are enabled again in this build.';
  }

  return `Admin access is temporarily limited to the configured owner email (${OWNER_ADMIN_EMAIL}) while testing. Other admin accounts are blocked from admin sign-in, trusted-device restore, and admin routes.`;
}

export function getAdminAccessLockHonestStatus(): string {
  if (isOpenAccessModeEnabled()) {
    return 'Yes — login is disabled in this build now. The app opens directly and admin routes are no longer blocked by the app-side owner lock.';
  }

  if (!OWNER_ADMIN_EMAIL) {
    return 'Yes — the temporary app-side admin lock is OFF in this build now. Owner/admin sessions, trusted-device restore, and admin routes are no longer blocked on the app side.';
  }

  return `Yes — the temporary owner-only admin lock is ON in this build now. Only ${OWNER_ADMIN_EMAIL} can keep admin access while testing.`;
}

export function getAdminAccessLockFixUpdate(): string {
  if (isOpenAccessModeEnabled()) {
    return 'The app now bypasses Owner Access and Sign In entirely in this build so the workspace opens directly while the underlying auth recovery work stays in place.';
  }

  if (!OWNER_ADMIN_EMAIL) {
    return 'The auth audit, password-reset route, trusted-device diagnostics, and role-resolution fixes remain in place, and the temporary app-side admin lock has now been removed.';
  }

  return 'The app now reads EXPO_PUBLIC_OWNER_EMAIL or NEXT_PUBLIC_OWNER_EMAIL and applies the temporary admin lock in the shared auth flow, trusted-device recovery, and admin route guard.';
}

export function getAdminAccessLockNextStep(): string {
  if (isOpenAccessModeEnabled()) {
    return 'Open the app directly. Admin routes and the main workspace now bypass the login gate in this build.';
  }

  if (!OWNER_ADMIN_EMAIL) {
    return 'If owner access still fails now, the remaining blocker is outside this temporary app-side lock — most likely the live Supabase credentials for that owner account or the backend repair key configuration.';
  }

  return `Use the exact owner email ${OWNER_ADMIN_EMAIL} for owner/admin access while testing. Non-owner admin accounts will be signed out or denied when they hit protected admin flows until this temporary lock is removed.`;
}
