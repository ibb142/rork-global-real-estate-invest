import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './supabase';
import { persistAuth, loadStoredAuth, clearStoredAuth, setAuthCredentials } from './auth-store';
import { isAdminRole, normalizeRole } from './auth-helpers';
import { startSessionMonitor } from './session-timeout';
import type { Session } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: string;
  role: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  phone?: string;
  country?: string;
  avatar?: string;
}

interface LoginResult {
  success: boolean;
  message: string;
  requiresTwoFactor?: boolean;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('investor');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const sessionMonitorCleanup = useRef<(() => void) | null>(null);

  const fetchProfileRole = useCallback(async (userId: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (!error && data?.role) {
        console.log('[Auth] Role from profiles table:', data.role);
        return data.role;
      }
      console.log('[Auth] Could not fetch role from profiles:', error?.message);
    } catch (e) {
      console.log('[Auth] Profile role fetch error:', (e as Error)?.message);
    }
    return 'investor';
  }, []);

  const doLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.log('[Auth] Logout error:', e);
    }
    await clearStoredAuth();
    setUser(null);
    setIsAuthenticated(false);
    setUserRole('investor');
    setRequiresTwoFactor(false);
    if (sessionMonitorCleanup.current) {
      sessionMonitorCleanup.current();
      sessionMonitorCleanup.current = null;
    }
    console.log('[Auth] Logged out');
  }, []);

  const startMonitor = useCallback(() => {
    if (sessionMonitorCleanup.current) {
      sessionMonitorCleanup.current();
    }
    sessionMonitorCleanup.current = startSessionMonitor(() => {
      console.log('[Auth] Session timed out — logging out');
      void doLogout();
    });
  }, [doLogout]);

  const handleSession = useCallback(async (session: Session) => {
    const supaUser = session.user;
    const meta = supaUser.user_metadata || {};

    const dbRole = await fetchProfileRole(supaUser.id);
    const role = normalizeRole(dbRole);

    if (!dbRole) {
      console.warn('[Auth] No server role found for user:', supaUser.id, '— defaulting to investor. JWT metadata role is NOT trusted for authorization.');
    }

    const authUser: AuthUser = {
      id: supaUser.id,
      email: supaUser.email || '',
      firstName: meta.firstName || meta.first_name || '',
      lastName: meta.lastName || meta.last_name || '',
      kycStatus: meta.kycStatus || 'pending',
      role,
      emailVerified: !!supaUser.email_confirmed_at,
      twoFactorEnabled: false,
    };

    setUser(authUser);
    setUserRole(role);
    setIsAuthenticated(true);

    await persistAuth({
      token: session.access_token,
      refreshToken: session.refresh_token || '',
      userId: supaUser.id,
      userRole: role,
    });

    startMonitor();
    console.log('[Auth] Session set for:', supaUser.id, 'role:', role);
  }, [fetchProfileRole, startMonitor]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await handleSession(session);
        } else {
          const stored = await loadStoredAuth();
          if (stored.userId) {
            setAuthCredentials(null, stored.userId, stored.userRole);
            const refreshResult = await supabase.auth.refreshSession();
            if (refreshResult.data.session) {
              await handleSession(refreshResult.data.session);
              console.log('[Auth] Session restored via refresh for:', stored.userId);
            } else {
              console.log('[Auth] Stored userId found but session refresh failed — clearing');
              await clearStoredAuth();
            }
          }
        }
      } catch (e) {
        console.log('[Auth] Init error:', (e as Error)?.message);
      } finally {
        setIsLoading(false);
      }
    };

    void initAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const result = supabase.auth.onAuthStateChange(async (_event, session) => {
        console.log('[Auth] State changed:', _event);
        if (session) {
          await handleSession(session);
        } else if (_event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('investor');
          await clearStoredAuth();
          if (sessionMonitorCleanup.current) {
            sessionMonitorCleanup.current();
            sessionMonitorCleanup.current = null;
          }
        }
      });
      subscription = result?.data?.subscription ?? null;
    } catch (e) {
      console.log('[Auth] onAuthStateChange setup error:', (e as Error)?.message);
    }

    return () => {
      try { subscription?.unsubscribe(); } catch {}
      if (sessionMonitorCleanup.current) {
        sessionMonitorCleanup.current();
        sessionMonitorCleanup.current = null;
      }
    };
  }, [handleSession]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error('[Auth] Login error:', error.message);
        return { success: false, message: error.message };
      }

      if (data.session) {
        await handleSession(data.session);
        return { success: true, message: 'Login successful' };
      }

      return { success: false, message: 'Login failed' };
    } catch (error: any) {
      console.error('[Auth] Login exception:', error);
      return { success: false, message: error?.message || 'Login failed' };
    } finally {
      setLoginLoading(false);
    }
  }, [handleSession]);

  const verify2FA = useCallback(async (_code: string): Promise<LoginResult> => {
    return { success: false, message: '2FA not yet configured with Supabase' };
  }, []);

  const cancelTwoFactor = useCallback(() => {
    setRequiresTwoFactor(false);
  }, []);

  const register = useCallback(async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    country: string;
    referralCode?: string;
  }) => {
    setRegisterLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone || '',
            country: data.country,
            referralCode: data.referralCode || '',
            role: 'investor',
            kycStatus: 'pending',
          },
        },
      });

      if (error) {
        console.error('[Auth] Register error:', error.message);
        return { success: false, message: error.message };
      }

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            email: data.email,
            first_name: data.firstName,
            last_name: data.lastName,
            phone: data.phone || '',
            country: data.country,
            referral_code: data.referralCode || '',
            role: 'investor',
            kyc_status: 'pending',
            created_at: new Date().toISOString(),
          });

        if (profileError) {
          console.log('[Auth] Profile insert note:', profileError.message);
        }

        const { error: walletError } = await supabase
          .from('wallets')
          .insert({
            user_id: authData.user.id,
            available: 0,
            pending: 0,
            invested: 0,
            total: 0,
            currency: 'USD',
          });

        if (walletError) {
          console.log('[Auth] Wallet creation note:', walletError.message);
        } else {
          console.log('[Auth] Wallet created for new user:', authData.user.id);
        }

        console.log('[Auth] Registration successful for:', authData.user.id);
        return { success: true, message: 'Registration successful. Please check your email to verify.' };
      }

      return { success: false, message: 'Registration failed' };
    } catch (error: any) {
      console.error('[Auth] Register exception:', error);
      return { success: false, message: error?.message || 'Registration failed' };
    } finally {
      setRegisterLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.log('[Auth] Refresh failed:', error.message);
        return false;
      }
      if (data.session) {
        await handleSession(data.session);
        console.log('[Auth] Session refreshed');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      return false;
    }
  }, [handleSession]);

  const activateOwnerAccess = useCallback(async () => {
    try {
      if (!user?.id) {
        return { success: false, message: 'Not authenticated' };
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        console.error('[Auth] activateOwnerAccess: No active Supabase session. Cannot verify admin role without valid session.');
        return { success: false, message: 'No active session. Please log in again.' };
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileErr) {
        console.error('[Auth] SECURITY: Could not verify role from server:', profileErr.message);
        return { success: false, message: 'Server role verification failed. Admin access requires database confirmation.' };
      }

      const serverRole = normalizeRole(profile?.role);
      if (!isAdminRole(serverRole)) {
        console.warn('[Auth] activateOwnerAccess DENIED — server role is:', serverRole, 'for user:', user.id);
        return { success: false, message: `Access denied. Your server role is: ${serverRole}` };
      }

      setUserRole(serverRole);
      setUser(prev => prev ? { ...prev, role: serverRole } : prev);

      setAuthCredentials(null, user.id, serverRole);

      await persistAuth({
        token: currentSession.access_token,
        refreshToken: currentSession.refresh_token || '',
        userId: currentSession.user.id,
        userRole: serverRole,
      });

      console.log('[Auth] Owner access verified from server and activated. Role:', serverRole);
      return { success: true, message: `Access activated with role: ${serverRole}` };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to activate owner access';
      console.error('[Auth] Promote error:', msg);
      return { success: false, message: msg };
    }
  }, [user]);

  const ownerDirectAccess = useCallback(async (): Promise<LoginResult> => {
    return { success: false, message: 'Owner direct access not available' };
  }, []);

  const refetchProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await handleSession(session);
    } catch (e) {
      console.log('[Auth] refetchProfile error:', (e as Error)?.message);
    }
  }, [handleSession]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    isAdmin: isAdminRole(userRole),
    userRole,
    userId: user?.id ?? null,
    login,
    register,
    logout: doLogout,
    verify2FA,
    cancelTwoFactor,
    requiresTwoFactor,
    refreshSession,
    activateOwnerAccess,
    activatingOwner: false,
    ownerDirectAccess,
    ownerAccessLoading: false,
    loginLoading,
    registerLoading,
    verify2FALoading: false,
    profileData: user,
    refetchProfile,
  }), [
    user, isAuthenticated, isLoading, userRole, login, register, doLogout,
    verify2FA, cancelTwoFactor, requiresTwoFactor, refreshSession,
    activateOwnerAccess, ownerDirectAccess, loginLoading, registerLoading,
    refetchProfile,
  ]);
});
