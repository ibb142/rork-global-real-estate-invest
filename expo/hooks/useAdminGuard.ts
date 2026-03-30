import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isAdminRole } from '@/lib/auth-helpers';
import { isProduction } from '@/lib/environment';

export interface AdminGuardState {
  isAdmin: boolean;
  isVerifying: boolean;
  userId: string | null;
  role: string | null;
  error: string | null;
}

export function useAdminGuard(options?: { redirectOnFail?: boolean; silent?: boolean }): AdminGuardState {
  const router = useRouter();
  const [state, setState] = useState<AdminGuardState>({
    isAdmin: false,
    isVerifying: true,
    userId: null,
    role: null,
    error: null,
  });

  const verify = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      console.log('[AdminGuard] Supabase not configured — blocking access');
      setState({
        isAdmin: false,
        isVerifying: false,
        userId: null,
        role: null,
        error: 'Supabase not configured',
      });
      return;
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        console.log('[AdminGuard] No authenticated session:', sessionError?.message ?? 'no session');
        setState({
          isAdmin: false,
          isVerifying: false,
          userId: null,
          role: null,
          error: 'Not authenticated',
        });
        return;
      }

      const userId = session.user.id;

      let serverRole: string | null = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('[AdminGuard] profiles query FAILED:', error.message);
          if (isProduction()) {
            console.error('[AdminGuard] SECURITY: Cannot verify admin role from server in production. Access DENIED.');
            setState({
              isAdmin: false,
              isVerifying: false,
              userId,
              role: null,
              error: 'Server role verification failed. Admin access requires server confirmation.',
            });
            return;
          }
        }

        if (!error && data?.role) {
          serverRole = data.role;
        }
      } catch (profileErr) {
        console.error('[AdminGuard] profiles query exception:', (profileErr as Error)?.message);
        if (isProduction()) {
          setState({
            isAdmin: false,
            isVerifying: false,
            userId,
            role: null,
            error: 'Server verification unavailable. Admin access denied.',
          });
          return;
        }
      }

      if (!serverRole && isProduction()) {
        console.error('[AdminGuard] SECURITY: No server-confirmed role in production. Denying admin access. JWT metadata is NOT trusted for admin authorization.');
        setState({
          isAdmin: false,
          isVerifying: false,
          userId,
          role: 'investor',
          error: 'Admin role must be confirmed by server. Contact support if this is an error.',
        });
        return;
      }

      const effectiveRole = serverRole ?? 'investor';
      const adminVerified = isAdminRole(effectiveRole);

      console.log('[AdminGuard] Verified — userId:', userId, '| role:', effectiveRole, '| isAdmin:', adminVerified, '| source:', serverRole ? 'profiles_table' : 'denied_no_server_role');

      setState({
        isAdmin: adminVerified,
        isVerifying: false,
        userId,
        role: effectiveRole,
        error: adminVerified ? null : `Access denied. Role "${effectiveRole}" is not an admin role.`,
      });
    } catch (err) {
      console.error('[AdminGuard] Verification error:', (err as Error)?.message);
      setState({
        isAdmin: false,
        isVerifying: false,
        userId: null,
        role: null,
        error: (err as Error)?.message ?? 'Verification failed',
      });
    }
  }, []);

  useEffect(() => {
    void verify();
  }, [verify]);

  useEffect(() => {
    if (state.isVerifying) return;
    if (state.isAdmin) return;

    if (options?.redirectOnFail !== false) {
      if (!options?.silent) {
        Alert.alert(
          'Access Denied',
          state.error ?? 'You do not have admin privileges to view this page.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        router.back();
      }
    }
  }, [state.isVerifying, state.isAdmin, state.error, options?.redirectOnFail, options?.silent, router]);

  return state;
}
