import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabase';
import { persistAuth, loadStoredAuth, clearStoredAuth, isAdminRole, setAuthCredentials, getAuthToken, getRefreshToken, getAuthUserId } from './auth-store';
import type { Session } from '@supabase/supabase-js';

interface AuthUser {
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

  const handleSession = useCallback(async (session: Session) => {
    const supaUser = session.user;
    const meta = supaUser.user_metadata || {};
    const role = meta.role || 'investor';

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

    console.log('[Auth] Session set for:', supaUser.id);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await handleSession(session);
        } else {
          const stored = await loadStoredAuth();
          if (stored.token && stored.userId) {
            setIsAuthenticated(true);
            if (stored.userRole) setUserRole(stored.userRole);
            console.log('[Auth] Session restored from store for:', stored.userId);
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
        }
      });
      subscription = result?.data?.subscription ?? null;
    } catch (e) {
      console.log('[Auth] onAuthStateChange setup error:', (e as Error)?.message);
    }

    return () => {
      try { subscription?.unsubscribe(); } catch {}
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

  const logout = useCallback(async () => {
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
    console.log('[Auth] Logged out');
  }, []);

  const activateOwnerAccess = useCallback(async () => {
    try {
      const newRole = 'owner';
      setUserRole(newRole);
      if (user) {
        setUser({ ...user, role: newRole });
      }

      setAuthCredentials(
        getAuthToken(),
        getAuthUserId() || user?.id || null,
        newRole,
        getRefreshToken(),
      );
      console.log('[Auth] Auth store updated with role:', newRole);

      const { error } = await supabase.auth.updateUser({
        data: { role: newRole },
      });

      if (error) {
        console.error('[Auth] Owner access error:', error.message);
        return { success: false, message: error.message };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await persistAuth({
          token: session.access_token,
          refreshToken: session.refresh_token || '',
          userId: session.user.id,
          userRole: newRole,
        });
      }

      console.log('[Auth] Owner access activated and persisted');
      return { success: true, message: 'Owner access activated' };
    } catch (error: any) {
      console.error('[Auth] Promote error:', error);
      return { success: false, message: error?.message || 'Failed to activate owner access' };
    }
  }, [user]);

  const ownerDirectAccess = useCallback(async (): Promise<LoginResult> => {
    return { success: false, message: 'Owner direct access not available' };
  }, []);

  const refetchProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleSession(session);
  }, [handleSession]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    isAdmin: isAdminRole(userRole),
    userRole,
    login,
    register,
    logout,
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
    user, isAuthenticated, isLoading, userRole, login, register, logout,
    verify2FA, cancelTwoFactor, requiresTwoFactor, refreshSession,
    activateOwnerAccess, ownerDirectAccess, loginLoading, registerLoading,
    refetchProfile,
  ]);
});
