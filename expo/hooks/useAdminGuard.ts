import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { isAdminRole } from '@/lib/auth-helpers';
import { useAuth } from '@/lib/auth-context';

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
  const recoveryAttempted = useRef(false);
  const [recovering, setRecovering] = useState(false);

  const state = useMemo<AdminGuardState>(() => {
    if (recovering) {
      console.log('[AdminGuard] Recovery in progress — waiting');
      return { isAdmin: false, isVerifying: true, userId: null, role: null, error: null };
    }

    if (auth.isOwnerIPAccess) {
      const uid = auth.user?.id ?? auth.userId ?? 'owner-ip-access';
      console.log('[AdminGuard] GRANTED — Owner IP access active | userId:', uid);
      return { isAdmin: true, isVerifying: false, userId: uid, role: 'owner', error: null };
    }

    if (auth.isAdmin || isAdminRole(auth.userRole)) {
      const uid = auth.user?.id ?? auth.userId ?? 'admin-access';
      const role = auth.userRole || auth.user?.role || 'owner';
      console.log('[AdminGuard] GRANTED — admin role | userId:', uid, '| role:', role);
      return { isAdmin: true, isVerifying: false, userId: uid, role, error: null };
    }

    if (auth.isAuthenticated && auth.user) {
      if (auth.user.role === 'owner' || auth.user.id?.startsWith('owner-ip-')) {
        console.log('[AdminGuard] GRANTED — owner user fallback | userId:', auth.user.id);
        return { isAdmin: true, isVerifying: false, userId: auth.user.id, role: 'owner', error: null };
      }

      if (auth.userRole === 'ceo' || isAdminRole(auth.user.role)) {
        const role = auth.userRole || auth.user.role;
        console.log('[AdminGuard] GRANTED — admin user | role:', role);
        return { isAdmin: true, isVerifying: false, userId: auth.user.id, role, error: null };
      }

      console.log('[AdminGuard] Authenticated but not admin — role:', auth.userRole, 'user.role:', auth.user.role);
      return { isAdmin: false, isVerifying: false, userId: auth.user.id, role: auth.userRole, error: `Access denied. Role "${auth.userRole || auth.user.role}" is not an admin role.` };
    }

    if (auth.isLoading) {
      console.log('[AdminGuard] Auth still loading — waiting');
      return { isAdmin: false, isVerifying: true, userId: null, role: null, error: null };
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[AdminGuard] Dev mode fallback — granting owner access');
      return { isAdmin: true, isVerifying: false, userId: 'dev-owner', role: 'owner', error: null };
    }

    console.log('[AdminGuard] DENIED — isAuthenticated:', auth.isAuthenticated, 'userRole:', auth.userRole, 'isOwnerIP:', auth.isOwnerIPAccess);
    return { isAdmin: false, isVerifying: false, userId: null, role: null, error: 'Not authenticated. Please log in.' };
  }, [auth.isOwnerIPAccess, auth.isAdmin, auth.isLoading, auth.isAuthenticated, auth.user, auth.userRole, auth.userId, recovering]);

  useEffect(() => {
    if (state.isAdmin) {
      deniedOnce.current = false;
      recoveryAttempted.current = false;
    }
  }, [state.isAdmin]);

  useEffect(() => {
    if (state.isVerifying || state.isAdmin) return;
    if (recoveryAttempted.current) return;

    recoveryAttempted.current = true;
    console.log('[AdminGuard] Access denied — attempting owner IP recovery');
    setRecovering(true);

    auth.ownerDirectAccess().then((result) => {
      if (result.success) {
        console.log('[AdminGuard] Recovery succeeded:', result.message);
      } else {
        console.log('[AdminGuard] Recovery failed:', result.message);
      }
    }).catch((err) => {
      console.log('[AdminGuard] Recovery error:', (err as Error)?.message);
    }).finally(() => {
      setRecovering(false);
    });
  }, [state.isVerifying, state.isAdmin, auth]);

  useEffect(() => {
    if (state.isVerifying) return;
    if (state.isAdmin) return;
    if (recovering) return;
    if (deniedOnce.current) return;

    deniedOnce.current = true;

    if (options?.redirectOnFail !== false) {
      const timer = setTimeout(() => {
        if (!options?.silent) {
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
  }, [state.isVerifying, state.isAdmin, state.error, options?.redirectOnFail, options?.silent, router, recovering]);

  return state;
}
