import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { isAdminRole } from '@/lib/auth-helpers';
import { useAuth } from '@/lib/auth-context';
import { getAdminAccessLockMessage, isOwnerAdminEmail, shouldBlockRoleForAdminAccess } from '@/lib/admin-access-lock';
import { isOpenAccessModeEnabled } from '@/lib/open-access';

let __adminGuardRenderCount = 0;

export interface AdminGuardState {
  isAdmin: boolean;
  isVerifying: boolean;
  userId: string | null;
  role: string | null;
  error: string | null;
}

export function useAdminGuard(options?: { redirectOnFail?: boolean; silent?: boolean }): AdminGuardState {
  const router = useRouter();
  const auth = useAuth();
  const deniedOnce = useRef(false);

  // Stabilize options access via primitives so a fresh `{ redirectOnFail: true }` object
  // passed by callers each render does not destabilize downstream effects.
  const redirectOnFail = options?.redirectOnFail !== false;
  const silent = !!options?.silent;

  // Diagnostic render counter (loop tracing).
  __adminGuardRenderCount += 1;
  if (__adminGuardRenderCount % 25 === 0) {
    console.log('[AdminGuard][render-trace] hook render count:', __adminGuardRenderCount);
  }

  // Pull primitive fields off `auth` so the memo depends on stable primitives,
  // not the `auth.user` object reference (which can vary across renders even when content is equal).
  const authUserId = auth.user?.id ?? null;
  const authUserEmail = auth.user?.email ?? null;
  const authUserRoleField = auth.user?.role ?? null;
  const { isOwnerIPAccess, isAdmin: authIsAdmin, isLoading, isAuthenticated, userRole, userId } = auth;

  const state = useMemo<AdminGuardState>(() => {
    if (isOpenAccessModeEnabled()) {
      const uid = authUserId ?? userId ?? 'open-access-admin';
      const role = userRole ?? authUserRoleField ?? 'owner';
      console.log('[AdminGuard] GRANTED — open access mode active | userId:', uid, '| role:', role);
      return { isAdmin: true, isVerifying: false, userId: uid, role, error: null };
    }

    // The true owner is NEVER blocked by the temporary admin lock. Grant owner
    // access (owner-IP session OR the configured owner email) BEFORE evaluating
    // the lock, so an owner can always reach the Admin Panel regardless of email
    // casing or owner-IP fallback. The lock only blocks OTHER admin roles.
    if (isOwnerIPAccess) {
      const uid = authUserId ?? userId ?? 'owner-ip-access';
      console.log('[AdminGuard] GRANTED — Owner IP access active (lock-exempt) | userId:', uid);
      return { isAdmin: true, isVerifying: false, userId: uid, role: 'owner', error: null };
    }

    if (isOwnerAdminEmail(authUserEmail)) {
      const uid = authUserId ?? userId ?? 'owner-email-access';
      const role = userRole || authUserRoleField || 'owner';
      console.log('[AdminGuard] GRANTED — configured owner email (lock-exempt) | userId:', uid, '| role:', role);
      return { isAdmin: true, isVerifying: false, userId: uid, role, error: null };
    }

    const adminLockBlocked = shouldBlockRoleForAdminAccess(userRole, authUserEmail);

    if (adminLockBlocked) {
      console.log('[AdminGuard] DENIED — owner-only admin lock blocked this non-owner session | email:', authUserEmail ?? 'unknown', '| role:', userRole ?? 'unknown');
      return { isAdmin: false, isVerifying: false, userId: authUserId ?? userId ?? null, role: userRole ?? null, error: getAdminAccessLockMessage() };
    }

    if (authIsAdmin || isAdminRole(userRole)) {
      const uid = authUserId ?? userId ?? 'admin-access';
      const role = userRole || authUserRoleField || 'owner';
      console.log('[AdminGuard] GRANTED — admin role | userId:', uid, '| role:', role);
      return { isAdmin: true, isVerifying: false, userId: uid, role, error: null };
    }

    if (isAuthenticated && authUserId) {
      const resolvedRole = userRole || authUserRoleField || null;
      const ownerIpFallback = authUserId.startsWith('owner-ip-');
      if (ownerIpFallback || isAdminRole(resolvedRole)) {
        const role = ownerIpFallback
          ? (resolvedRole && isAdminRole(resolvedRole) ? resolvedRole : 'owner')
          : (resolvedRole ?? 'owner');
        console.log('[AdminGuard] GRANTED — authenticated admin fallback | userId:', authUserId, '| role:', role, '| ownerIpFallback:', ownerIpFallback);
        return { isAdmin: true, isVerifying: false, userId: authUserId, role, error: null };
      }

      console.log('[AdminGuard] Authenticated but not admin — role:', userRole, 'user.role:', authUserRoleField);
      return { isAdmin: false, isVerifying: false, userId: authUserId, role: userRole, error: `Access denied. Role "${userRole || authUserRoleField}" is not an admin role.` };
    }

    if (isLoading) {
      console.log('[AdminGuard] Auth still loading — waiting');
      return { isAdmin: false, isVerifying: true, userId: null, role: null, error: null };
    }

    console.log('[AdminGuard] DENIED — isAuthenticated:', isAuthenticated, 'userRole:', userRole, 'isOwnerIP:', isOwnerIPAccess);
    return { isAdmin: false, isVerifying: false, userId: null, role: null, error: 'Not authenticated. Please log in.' };
  }, [isOwnerIPAccess, authIsAdmin, isLoading, isAuthenticated, authUserId, authUserEmail, authUserRoleField, userRole, userId]);

  useEffect(() => {
    if (state.isAdmin) {
      deniedOnce.current = false;
    }
  }, [state.isAdmin]);

  useEffect(() => {
    if (state.isVerifying) return;
    if (state.isAdmin) return;
    if (deniedOnce.current) return;

    deniedOnce.current = true;

    if (redirectOnFail) {
      const timer = setTimeout(() => {
        if (!silent) {
          Alert.alert(
            'Access Denied',
            state.error ?? 'You do not have admin privileges to view this page.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
        } else {
          router.back();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.isVerifying, state.isAdmin, state.error, redirectOnFail, silent, router]);

  return state;
}
